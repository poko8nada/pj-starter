# events — Project Driving System

This project is driven by an append-only event log. The log is the single source of truth; every snapshot is a generated artifact folded from the log. Stateful documents are never edited directly — all changes are recorded as events, and readers always consume the fold result.

## Directory layout

```
events/
  README.md            # This document (driving system spec)
  spec/
    product.md         # Product snapshot specification (sections, features guide)
    meta.md            # Meta snapshot specification (harness/skills/docs/scripts)
  scripts/
    lib.mjs            # Shared fold/validation logic
    append.mjs         # Append one event — the only script skills/agents call
    build.mjs          # Regenerate snapshots from checkpoint + log
    compact.mjs        # Fold state into checkpoint.json and empty the log
  log.jsonl            # Append-only event log (the truth, git-tracked)
  checkpoint.json      # Folded state produced by compaction (generated, git-tracked)
  snapshots/           # Generated artifacts. Created on first build. Never hand-authored
```

`events/scripts/` holds scripts invoked by skills (product-side). Harness-operations scripts live in the root `scripts/`.

Snapshot freshness is maintained automatically: the harness's `session-idle` hook runs `build.mjs` after every turn and `compact.mjs` when the log crosses its line threshold (see `.opencode/lib/events-sync/threshold.ts`). Manual invocation remains available.

## Log format

JSONL. One event per line. **One line carries one concern.** `ts` is always assigned by `append.mjs` (never handwritten). Timestamps are fixed-offset JST (`+09:00`, ISO 8601). There is no sequence number — ordering is simply file order.

```jsonl
{"ts":"2026-08-24T09:10:00.000+09:00","type":"set","key":"agenda.uw-001","value":{"title":"introduce auth"}}
{"ts":"2026-08-24T09:25:00.000+09:00","type":"set","key":"product.features.auth","value":{"trigger":"…","result":"…","route":["…"]}}
{"ts":"2026-08-24T09:26:00.000+09:00","type":"set","key":"product.features.auth.status","value":"implement","note":"first slice of uw-001"}
```

- `ts` — ISO 8601 in JST (`+09:00`). Assignment time
- `type` — `set` or `del`
- `key` — dotted path, always required
- `value` — JSON string or object. **A full-state assertion at that exact path, never a diff**
- `note` — optional one-line remark for future readers. **Ignored by the fold; never appears in snapshots**

The log serves two readers: the reducer consumes `type`/`key`/`value`; humans and future agents also read `note`.

### Event types

- `set` — overwrite the value at the exact path (last-write-wins). Scalar intermediates are replaced by objects when deeper paths are written
- `del` — remove the leaf at the path; empty ancestors are pruned

Lifecycle facts (implemented / audited / committed) are not special types — they are ordinary `set`s on deep keys such as `product.features.<id>.status`. Audit results themselves stay conversational; only the resulting state is asserted.

### Keys and namespaces

The first segment must be one of `product` / `meta` / `agenda`. Unknown namespaces are rejected on append.

- `product.*` — second segment is fixed: `name` / `what` / `stack` / `look` / `features` / `roadmap` / `deploy`
- `meta.*` — second segment is fixed: `harness` / `skills` / `docs` / `scripts` (see [spec/meta.md](./spec/meta.md))
- `agenda.*` — units of work; projection is optional

## Compaction

The active log has a line threshold (**1000**, defined in `.opencode/lib/events-sync/threshold.ts`). When the idle hook observes the threshold crossed, it runs `compact.mjs`:

1. Fold checkpoint + active log into current trees
2. Write `checkpoint.json` (`{ compactedAt, asOf, trees }`)
3. Empty `log.jsonl`; subsequent appends simply continue on top of the checkpoint

Pre-compaction history lives in git — no archive mechanism exists. Because compaction preserves folded state exactly, existing snapshots remain valid without an immediate rebuild.

## Snapshots

Generated only by `build.mjs`. Hand-authoring or hand-editing snapshot files violates this system.

```json
{
  "generatedAt": "2026-08-24T09:20:00.000+09:00",
  "asOf": "2026-08-24T09:26:00.000+09:00",
  "content": {}
}
```

- `generatedAt` — when this snapshot was last written. Refreshed only when the content actually changed, so repeated builds are stable
- `asOf` — the timestamp of the newest event reflected in this snapshot. Compare against the log's latest event to detect staleness
- Consumers read `content` only

Product structure is specified in [spec/product.md](./spec/product.md). Meta machinery is specified in [spec/meta.md](./spec/meta.md); `meta.json` is produced only when `meta.*` events exist.

## Rebuild rules

1. Load `checkpoint.json` as the base trees (empty trees when absent)
2. Apply active-log events in file order: `set` overwrites the leaf, `del` removes it and prunes empty ancestors
3. Normalize `features`: leaves without `status`/`isDone` receive `"planned"` / `false`
4. Regenerate snapshots in full; skip writing when the content is unchanged

## CLI reference

```bash
# Append (value is parsed as JSON; falls back to a raw string)
node events/scripts/append.mjs --type set --key product.name --value 'Pj Docs' --note 'initial definition'
node events/scripts/append.mjs --type set --key product.features.auth --value '{"trigger":"…","result":"…","route":["…"]}'
node events/scripts/append.mjs --type set --key product.features.auth.status --value 'implement'
node events/scripts/append.mjs --type del --key product.features.old_feature

# Batch: one JSONL line per draft event (no ts — assigned by the script).
# All lines are validated first; any invalid line aborts the whole batch
node events/scripts/append.mjs --file draft.jsonl

# Regenerate snapshots / force a checkpoint
node events/scripts/build.mjs
node events/scripts/compact.mjs
```

For testing, point `EVENTS_DIR` at a scratch copy of this directory.

## Operation flow

Recording follows one of three paths, depending on what was agreed:

1. **Plain value changes** — `product.what`, stack entries, status updates outside agenda. Append directly; no skill needed.
2. **Structural registrations** — new features, new meta components, splits, definition revisions. The `feature` skill records them with complete definitions; new entries enter as `planned`.
3. **Implementation decisions** — the `agenda` skill selects targets from existing state. On consensus, selected targets become `"ready"` and implementation begins.

In every path, stack / roadmap changes surfaced by the discussion are appended together with their related events. After the turn ends, the idle hook keeps quality checks and snapshots fresh automatically.

## Harness independence

This directory is a product-side asset and does not depend on any specific agent harness. When the harness changes, the new harness's skills follow this document and wire their own hooks to `build.mjs` / `compact.mjs`.
