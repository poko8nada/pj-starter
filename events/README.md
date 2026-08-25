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
    append.mjs         # Append events — the only script skills/agents call
    build.mjs          # Regenerate snapshots from checkpoint + log
    compact.mjs        # Fold state into checkpoint.json and empty the log
    read.mjs           # Read a snapshot's content
  log.jsonl            # Append-only event log (the truth, git-tracked)
  checkpoint.json      # Folded state produced by compaction (generated, git-tracked)
  snapshots/           # Generated artifacts. Created on first build. Never hand-authored
```

`events/scripts/` holds scripts invoked by skills (product-side). Harness-operations scripts live in the root `scripts/`.

Snapshot freshness is maintained automatically: the harness's `session-idle` hook runs `build.mjs` after every turn and `compact.mjs` when the log crosses its line threshold (see `.opencode/lib/events-sync/threshold.ts`). Manual invocation remains available.

## Log format

JSONL. One event per line. **One line carries one concern** — a value assertion, or a whole status assertion. `ts` is always assigned by `append.mjs` (never handwritten), and **all events from one invocation share one ts**. Timestamps are fixed-offset JST (`+09:00`, ISO 8601). There is no sequence number — ordering is simply file order.

```jsonl
{"ts":"2026-08-25T10:00:00.000+09:00","type":"set","key":"product.name.value","value":"Pj Docs"}
{"ts":"2026-08-25T10:00:00.000+09:00","type":"set","key":"product.name.status","value":{"text":"プロダクト名を確定"}}
{"ts":"2026-08-25T10:05:00.000+09:00","type":"set","key":"product.features.auth.status","value":{"stage":"implement","text":"認証APIを実装中"}}
{"ts":"2026-08-25T10:06:00.000+09:00","type":"del","key":"product.features.old_feature"}
```

- `ts` — ISO 8601 in JST (`+09:00`). Assignment time
- `type` — `set` or `del`
- `key` — dotted path, always required
- `value` — JSON string or object. **A full-state assertion at that exact path, never a diff**

The reducer consumes `type`/`key`/`value`; progress lives in each node's `status` (see [spec/meta.md](./spec/meta.md)).

### Event types

- `set` — overwrite the value at the exact path (last-write-wins). Scalar intermediates are replaced by objects when deeper paths are written
- `del` — remove the leaf at the path; empty ancestors are pruned

Lifecycle facts (ready / implemented / committed) are not special types — they are ordinary `set`s on `<work-unit>.status`, asserted **whole**: `{stage, text}` travels together in one event, so a stage transition can never be recorded without its progress note.

### Keys and namespaces

The first segment must be one of `product` / `meta`. Unknown namespaces are rejected on append.

- `product.*` — second segment is fixed: `name` / `what` / `stack` / `look` / `features` / `roadmap` / `deploy`
- `meta.*` — second segment is fixed: `harness` / `skills` / `docs` / `scripts` (see [spec/meta.md](./spec/meta.md))

Every section is an object: content fields sit in parallel with an optional `status`. Two kinds of nodes exist:

| Kind         | Key shape                              | status shape                                     | Example                                                     |
| ------------ | -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Fact section | `product.<section>`                    | `{text}` — what was last changed there           | `product.stack.status`                                      |
| Work unit    | `<ns>.<collection>.<id>` (3rd segment) | `{stage, text}` — pipeline stage + progress note | `product.features.auth.status`, `meta.skills.agenda.status` |

Work units are exactly the depth-3 nodes below a collection point (`product.features`, or any meta section). Only they may carry `stage`; the vocabulary is shared across namespaces: `planned` → `ready` → `implement` → `commit`.

Validation enforced on append:

- `.status` may only be written at fact-section roots or work units — anything deeper (`product.stack.build.status`) or partial (`.status.stage`, `.status.text`) is rejected
- Work-unit status requires exactly `{stage, text}` with `stage` in the vocabulary; fact-section status requires exactly `{text}`
- A node becomes _managed_ by writing its `status`; managed nodes receive `updatedAt` (YYYYMMDD) at rebuild. Nodes without status stay raw forever

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
  "generatedAt": "2026-08-25T10:00:00.000+09:00",
  "asOf": "2026-08-25T10:06:00.000+09:00",
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
3. Normalize work units: nodes carrying `trigger` (product) or `purpose` (meta) without a complete `status` receive `{"stage": "planned", "text": "未着手"}`; out-of-vocabulary stages fail the build
4. Inject `updatedAt` (YYYYMMDD) on every status-bearing node, from the `ts` of the latest event touching the node itself or anything under it
5. Regenerate snapshots in full; skip writing when the content is unchanged

## CLI reference

```bash
# One invocation carries one or more operations; all are validated first,
# any invalid operation aborts the whole batch. One shared ts per invocation
node events/scripts/append.mjs --set product.name.value 'Pj Docs'
node events/scripts/append.mjs \
  --set product.features.auth.status '{"stage":"implement","text":"認証APIを実装中"}' \
  --set product.roadmap.mvp '["auth"]'
node events/scripts/append.mjs --del product.features.old_feature

# Batch: one JSONL line per draft event (no ts — assigned by the script).
# All lines are validated first; any invalid line aborts the whole batch
node events/scripts/append.mjs --file draft.jsonl

# Regenerate snapshots / force a checkpoint
node events/scripts/build.mjs
node events/scripts/compact.mjs

# Read a snapshot's content
node events/scripts/read.mjs --name product
```

Values are parsed as JSON; unparseable strings are kept raw. For testing, point `EVENTS_DIR` at a scratch copy of this directory.

## Operation flow

Recording follows one of three paths, depending on what was agreed:

1. **Plain value changes** — `product.what`, stack entries, notes on fact sections. Append directly; no skill needed.
2. **Structural registrations** — new features, new meta components, splits, definition revisions. The `feature` skill records them with complete definitions; new entries enter as `planned`.
3. **Implementation decisions** — the `agenda` skill selects targets from existing state. On consensus, each selected target's status is asserted in one event: `{"stage": "ready", "text": "<progress>"}`, and implementation begins.

In every path, stack / roadmap changes surfaced by the discussion are appended together with their related events. After the turn ends, the idle hook keeps quality checks and snapshots fresh automatically.

## Harness independence

This directory is a product-side asset and does not depend on any specific agent harness. When the harness changes, the new harness's skills follow this document and wire their own hooks to `build.mjs` / `compact.mjs`.
