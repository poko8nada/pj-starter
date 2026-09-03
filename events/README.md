# events — Project Driving System

This project is driven by an append-only event log. The log is the single source of truth; every snapshot is a generated artifact folded from the log. Stateful documents are never edited directly — all changes are recorded as events, and readers always consume the fold result.

## Directory layout

```
events/
  README.md            # This document (driving system spec)
  spec/
    schema.md          # Snapshot content schemas (product/meta sections, feature methodology)
    machinery.md       # Machine internals (trail, rebuild, compaction, CLI) — agents rarely need this
  scripts/
    append.mjs         # Append events — the raw append script (used by the append-build wrapper)
    append-build.mjs   # Append + build wrapper — the canonical path agents and skills call
    build.mjs          # Regenerate snapshots from checkpoint + log
    compact.mjs        # Fold state into checkpoint.json and empty the log
    read.mjs           # Read a snapshot's content
  log.jsonl            # Append-only event log (the truth, git-tracked)
  checkpoint.json      # Base state: compaction result or reset-seeded baseline (generated, git-tracked)
  snapshots/           # The current state lives here (generated — never hand-authored)
    product.json       # Folded product.* state
    meta.json          # Folded meta.* state (written when folded meta state is non-empty)
```

Snapshot freshness is maintained automatically: every append goes through `append-build.mjs`, which runs `build.mjs` after a successful append, and the harness's `session-idle` hook runs `compact.mjs` when the log crosses the threshold in `.opencode/lib/event-compact/threshold.ts`.

## Reading current state

The current project state is the fold result under `snapshots/`: `product.json` for `product.*`, `meta.json` for `meta.*`. Read the files directly or via `node events/scripts/read.mjs --name product|meta`. On a fresh checkout they may not exist yet — run `node events/scripts/build.mjs` once to generate them (`meta.json` appears once folded `meta.*` state exists — events or a reset-seeded baseline).

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

## Log format

JSONL. One event per line. **One line carries one concern** — a value assertion, or a whole status assertion. `ts` is always assigned by `append.mjs` (never handwritten) — except machine-injected `log.*` lines, which the harness plugin assigns via the same builder — and **all events from one invocation share one ts**. Timestamps are fixed-offset JST (`+09:00`, ISO 8601). There is no sequence number — ordering is simply file order. `branch` is the current git branch at append time (from `git branch --show-current`, overridable via `EVENTS_BRANCH`), used to identify a branch's delta when merging logs; it is omitted when unset.

```jsonl
{"ts":"2026-08-25T10:00:00.000+09:00","type":"set","key":"product.name.value","value":"Pj Docs","branch":"develop"}
{"ts":"2026-08-25T10:00:00.000+09:00","type":"set","key":"product.name.status","value":{"text":"プロダクト名を確定"},"branch":"develop"}
{"ts":"2026-08-25T10:05:00.000+09:00","type":"set","key":"product.features.auth.status","value":{"stage":"implement","text":"認証APIを実装中"},"branch":"feature/auth"}
{"ts":"2026-08-25T10:06:00.000+09:00","type":"del","key":"product.features.old_feature","branch":"feature/auth"}
```

- `ts` — ISO 8601 in JST (`+09:00`), assigned by `append.mjs`. All events from one invocation share one ts
- `type` — `set` (overwrite, last-write-wins) or `del` (remove leaf, prune empty ancestors)
- `key` — dotted path, always required
- `value` — JSON string or object. **A full-state assertion at that exact path, never a diff**
- `branch` — the current git branch at append time (from `git branch --show-current`, overridable via `EVENTS_BRANCH`). Omitted when unset; an empty `EVENTS_BRANCH` is rejected on append. Used to identify a branch's delta when merging logs

## Recording contract

This section is the single home of the shared node model. What each section contains (content schemas, feature methodology) is specified in [spec/schema.md](./spec/schema.md).

### Keys and namespaces

The first segment must be one of `product` / `meta`. Unknown namespaces are rejected on append. The `log` namespace is the one exception — an append-only machine trail that never folds into snapshots (see [spec/machinery.md](./spec/machinery.md)).

- `product.*` — second segment is fixed: `name` / `what` / `stack` / `look` / `features` / `roadmap` / `deploy`
- `meta.*` — second segment is fixed: `harness` / `agents` / `skills` / `docs` / `scripts`

### Nodes and status

Every section is an object: content fields sit in parallel with an optional `status`. Two kinds of nodes exist:

| Kind         | Key shape                              | status shape                                     | Example                                                     |
| ------------ | -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Fact section | `product.<section>`                    | `{text}` — what was last changed there           | `product.stack.status`                                      |
| Work unit    | `<ns>.<collection>.<id>` (3rd segment) | `{stage, text}` — pipeline stage + progress note | `product.features.auth.status`, `meta.skills.agenda.status` |

Work units are exactly the depth-3 nodes below a collection point (`product.features`, or any meta section). Only they may carry `stage`; the vocabulary is shared across namespaces: `planned` → `ready` → `implement` → `commit`. A committed unit re-enters at `ready` whenever new work on it is agreed — units never close; change cycles do. Keep the stage truthful at all times.

Lifecycle facts (`ready` / `implement` / `commit`) are not special types — they are ordinary `set`s on `<work-unit>.status`, asserted **whole**: `{stage, text}` travels together in one event, so a stage transition can never be recorded without its progress note:

```jsonl
{"ts":"…","type":"set","key":"product.features.auth.status","value":{"stage":"ready","text":"実装計画が確定。実装待ち"}}
{"ts":"…","type":"set","key":"product.features.auth.status","value":{"stage":"implement","text":"認証APIを実装中"}}
```

A node becomes _managed_ by writing its `status`; managed nodes receive `updatedAt` (YYYYMMDD) at rebuild. The canonical registration route asserts the whole initial status (`{"stage":"planned","text":"未着手"}`) together with the definition, in both namespaces. As a backstop, rebuild guards product feature slices even when their status was never asserted (see [spec/machinery.md](./spec/machinery.md)); every other node without status stays raw forever — including meta components, whose raw form represents the shipped harness baseline.

### Validation enforced on append

- `.status` may only be written at fact-section roots or work units — anything deeper (`product.stack.build.status`) or partial (`.status.stage`, `.status.text`) is rejected
- Work-unit status requires exactly `{stage, text}` with `stage` in the vocabulary; fact-section status requires exactly `{text}`

## Operation flow

Recording follows one of three paths, depending on what was agreed:

1. **Plain value changes** — `product.what`, stack entries, notes on fact sections. Append directly; no skill needed.
2. **Structural registrations** — new features, new meta components, splits, definition revisions. The `feature` skill records them with complete definitions; new entries enter as `planned`.
   In every path, stack / roadmap changes surfaced by the discussion are appended together with their related events. Appends go through `append-build.mjs` (the wrapper), which runs the build after a successful append so the log's integrity is verified at every write. After the turn ends, the idle hook runs the compaction when the log crosses its line threshold.

## Fresh-copy state and the starter boundary

`scripts/user/` holds human-operated maintenance tools (project initialization, upstream apply from the starter). **Agents must not execute them** — initialization wipes recorded state, so it runs only when the user decides. If a task seems to need them, ask the user to run the tool instead.

What agents must be able to read from a fresh copy's state:

- An empty or placeholder `product.*` section means "not yet registered in this project" — register via the normal flow
- A meta component without `status` is the shipped harness inventory, not pending work; its lifecycle starts when this project first asserts its `status`
- The log is the truth for everything that happens inside the project; the checkpoint additionally carries the shipped baseline seeded at initialization
- Pre-copy history lives only in the starter's git

Usage of the tools is documented in `scripts/user/README.md` for the operator.

## Harness independence

This directory is a product-side asset and does not depend on any specific agent harness. When the harness changes, the new harness's skills follow this document and wire their own hooks to `build.mjs` / `compact.mjs`.
