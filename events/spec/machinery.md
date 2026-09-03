# Machinery

Everything below describes how the machine itself runs; recording agents rarely need it.

## Machine-injected trail (`log`)

The `log` namespace records what the agent tried per tool call — a coarse activity trail that sits between state events when the log is read top to bottom. It is written by harness plugins (the tool-trail emitter), never by recording agents.

- Key grammar: `log.try.<id>` (one line per tool try)
- Value shape: `{ "tool": "…", "gap": <non-negative int>, "targets": ["…"] }`; `gap` is the thinking time (ms) since the previous tool call in the same turn; `targets` holds the tool's subject — file paths, commands, queries, URLs, subagent names, skill names, or the MCP tool name itself
- Monitored tools: `read` / `edit` / `write` / `skill` / `bash` / `websearch` / `webfetch` / `task` and any `mcp_*` tool
- Semantics: a **try** — the tool was started after the thinking gap; success, failure, and user rejection are not distinguished
- Recording window: the trail records only within a work unit's implementation window — from the append that starts the work (any append that is not a `stage: commit` assertion) until the closing append (an append asserting `{"stage":"commit",…}`). `git commit` is a backstop that also closes the window. Outside the window (planning before the first append, post-commit turns) nothing is recorded. The window state persists across session boundaries and is initialized from the log's last state event on plugin start (no state event → OFF; a state event without `stage` — plain value or `del` — → ON). The append command itself is a boundary marker and is never recorded. Detection is command-string based: a batch `--file` append whose `stage: commit` lives inside the file is not recognized as closing (the canonical commit route always uses `--set`), and a non-closing append whose `text` literally contains `"stage":"commit"` is treated as closing (not observed in practice)
- Merging: the emitter keeps the trail merged — consecutive tries of the same tool collapse into one line whose `targets` array grows (the `gap` of the first try is kept). Only `log.try.*` lines are ever rewritten; state events are never touched
- Fold participation: **none**. `build.mjs` skips these lines and excludes them from `asOf`, so snapshots are untouched by trail volume
- Compaction: dropped. The checkpoint stores folded trees only, so trail lines vanish from the active log at compaction — history survives in git alone

## Compaction

The active log has a line threshold (**5000**, defined in `.opencode/lib/event-compact/threshold.ts`). When the idle hook observes the threshold crossed, it runs `compact.mjs`:

1. Fold checkpoint + active log into current trees
2. Write `checkpoint.json` (`{ compactedAt, asOf, trees }`)
3. Rewrite `log.jsonl` with survivor lines only: the last occurrence per exact key (including `del`), in original relative order; fold-excluded trail (`log.*`) is dropped. Because thinning preserves last-write-wins, the folded state is unchanged

Pre-compaction history lives in git — no archive mechanism exists. Because compaction preserves folded state exactly, existing snapshots remain valid without an immediate rebuild.

## Merge

Parallel git worktrees merge `events/log.jsonl` with the custom driver `event-merge-driver`: the incoming block first, then the current branch's new lines, with exact-duplicate lines deduped. Register per clone with `pnpm setup:merge-driver`. Generated files (`checkpoint.json`, `snapshots/*.json`) keep the current side via the `events-generated` driver and are rebuilt from the merged log with `build.mjs` — never hand-resolved.

## Rebuild rules

1. Load `checkpoint.json` as the base trees (empty trees when absent)
2. Apply active-log events in file order: `set` overwrites the leaf, `del` removes it and prunes empty ancestors
3. Guard product features: `trigger`-bearing slices without a complete `status` receive `{"stage": "planned", "text": "未着手"}`; out-of-vocabulary stages fail the build. Meta components are never normalized
4. Inject `updatedAt` (YYYYMMDD) on every status-bearing node, from the `ts` of the latest event touching the node itself or anything under it
5. Regenerate snapshots in full; skip writing when the content is unchanged

`meta.json` is written whenever the folded `meta.*` state is non-empty — from events or a reset-seeded baseline.

## CLI reference

# any invalid operation aborts the whole batch. One shared ts per invocation.

# append-build.mjs は append 成功後に build を実行し、両方の結果を出力する（正規の追記経路）

node events/scripts/append-build.mjs --set product.name.value 'Pj Docs'
node events/scripts/append-build.mjs \
--set product.features.auth.status '{"stage":"implement","text":"認証APIを実装中"}' \
--set product.roadmap.mvp '["auth"]'
node events/scripts/append-build.mjs --del product.features.old_feature

# Batch: one JSONL line per draft event (no ts — assigned by the script).

# All lines are validated first; any invalid line aborts the whole batch

node events/scripts/append-build.mjs --file draft.jsonl

# append のみ（検証なしで追記したい場合。通常は append-build を使う）

node events/scripts/append.mjs --set product.name.value 'Pj Docs'

# Regenerate snapshots / force a checkpoint

node events/scripts/build.mjs
node events/scripts/compact.mjs

# Read a snapshot's content

node events/scripts/read.mjs --name product

# Read unresolved work units (ready/implement) in human-readable form

node events/scripts/read.mjs --name meta --unresolved

```

Values are parsed as JSON; unparseable strings are kept raw. For testing, point `EVENTS_DIR` at a scratch copy of this directory.
```
