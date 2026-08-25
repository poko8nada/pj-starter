# Meta Snapshot Specification

`events/snapshots/meta.json` describes the **driving machinery** of the project: everything that operates the project rather than the output it produces. Generated only by `build.mjs` from `meta.*` events; never hand-authored.

## Boundary definition

> **meta = the machinery that drives and operates the project.**
> **product = the artifacts that machinery produces.**

Practical consequences:

- Agent-executed layers (plugins, skills, driving docs) belong here
- Quality gates (pre-commit enforcement) belong here — they drive how work ships
- Plain tool _configuration files_ are not inventoried individually; they appear only as part of a gate-level entry (see Granularity)

## Sections

The second segment of a `meta.*` key is fixed to these four:

| Section   | Contents                                                                           |
| --------- | ---------------------------------------------------------------------------------- |
| `harness` | Hook runtimes and plugin wiring (harness-dependent execution layer), quality gates |
| `skills`  | Skills, including ones merely planned                                              |
| `docs`    | Driving documents (AGENTS.md, events specs)                                        |
| `scripts` | Operational scripts (root `scripts/` and `events/scripts/`)                        |

Every section is a map of components — all four are work-unit collections, so every `meta.<section>.<id>` is a work unit at the same depth as `product.features.<id>`.

## Entry shape

Every component leaf carries a `purpose`; that field marks the object as a meta component:

```json
{
  "agenda": {
    "purpose": "Fix the unit of work per feature slice",
    "status": { "stage": "planned", "text": "未着手" },
    "updatedAt": "20260825"
  }
}
```

| Field          | Rule                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`         | Where the component lives. Omit while only planned; set once implemented                                                                                                  |
| `purpose`      | One-sentence intent. Required — its presence defines a component leaf                                                                                                     |
| `status.stage` | Mechanical pipeline stage, shared vocabulary across namespaces: `planned` → `ready` → `implement` → `commit`. Injected by rebuild (`"planned"` default); omit at creation |
| `status.text`  | Free-text progress note (what has been done so far). Required — always written together with the stage                                                                    |
| `updatedAt`    | Last update date (YYYYMMDD), injected by rebuild from the `ts` of the latest event touching the component                                                                 |

A committed component re-enters at `ready` whenever new work on it is agreed — components never close; change cycles do. Keep the stage truthful at all times.

Lifecycle transitions are single events asserting the whole status — identical to product slices:

```jsonl
{"ts":"…","type":"set","key":"meta.skills.mockup.status","value":{"stage":"ready","text":"実装計画が確定。実装待ち"}}
{"ts":"…","type":"set","key":"meta.skills.mockup.path","value":".opencode/skills/mockup/SKILL.md"}
{"ts":"…","type":"set","key":"meta.skills.mockup.status","value":{"stage":"commit","text":"SKILL.mdを作成し運用中"}}
```

The rebuild also injects `updatedAt` (YYYYMMDD) on each status-bearing component — the date its value was last written, derived from the event's `ts`.

## Granularity policy

- **One component = one purpose**, verifiable by **one surface**. An entry whose purpose needs "and" / "etc." is a bundle and must be split into sibling entries at the same depth (the oversized key is removed with `del`)
- Size each change cycle to complete within one working session (`ready → commit`)
- One entry per **entry point or mechanism** (a hook runtime, a skill, a script, a gate). Never per configuration file
- Tool configs (oxlint, oxfmt, tsconfig…) are summarized by their gate entry only — e.g. the pre-commit quality gate is one entry pointing at `lefthook.yaml`
- Library internals are reachable through the entry's `path`; do not enumerate them

The live inventory is always readable from `events/snapshots/meta.json`; this document deliberately does not duplicate it.

## Rebuild behavior

1. Fold `meta.*` events like any namespace
2. Normalize: every leaf carrying `purpose` receives `{"stage": "planned", "text": "未着手"}` unless a complete `status` is already set; out-of-vocabulary stages fail the build
3. Inject `updatedAt` (YYYYMMDD) on each status-bearing component from the `ts` of its latest event
4. `meta.json` is written only when at least one `meta.*` event exists
