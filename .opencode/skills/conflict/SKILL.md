---
name: conflict
description: Resolve git merge/pull conflicts after taking in the base (コンフリクト解消 / マージ / プル). Use when a merge stops with conflicts, handed off from pr skill, or checkpoint.json conflicts. Classifies log vs generated vs real code, keeps base-first with current-branch overlay, rebuilds snapshots, and records the resolution in the event log.
---

# Conflict

Resolve conflicts from taking the base into the current branch (parallel-worktree PR pre-pull or standalone pull). Base changes are the premise; current-branch changes go on top. Return in committable state; this skill never commits itself.

## Scope

- Entry points: handoff from the pr skill, or a standalone `git fetch` + `git merge` / `git pull` that stops with conflicts.
- Merge, not rebase: history stays merge-based so the log driver can combine histories.
- `events/log.jsonl` is always expected to conflict and is auto-resolved by the driver — verify only.
- Generated files (`events/checkpoint.json`, `events/snapshots/*.json`) are never hand-edited for markers — discard and rebuild, with one manual exception below.

## Procedure

### 1. Inspect

- Confirm an in-progress merge: `git rev-parse MERGE_HEAD` (succeeds while merging), `git status --short`, `git diff --name-only --diff-filter=U`.
- Back up event state before touching it: `cp events/checkpoint.json /tmp/checkpoint-ours.json`, `cp events/log.jsonl /tmp/log-ours.jsonl`.
- Classify unmerged paths:
  - A: `events/log.jsonl` — driver-resolved.
  - B: `events/checkpoint.json`, `events/snapshots/*.json` — generated.
  - C: everything else — real code.

### 2. Log (A) — verify only

- Confirm no markers remain: `grep -c '^<<<<<<< ' events/log.jsonl` must be `0`.
- Rebuild and confirm: `node events/scripts/build.mjs`. The merged log is parent-first plus the current-branch delta last, so the current branch wins on keys by design.

### 3. Generated (B) — rebuild, never hand-resolve

- Snapshots carry no independent state: `git checkout --ours -- events/snapshots/` (either side works), then rebuild in step 5.
- Checkpoint holds folded state, so side choice matters. Default to base-first per policy: `git checkout --theirs -- events/checkpoint.json`, then rebuild in step 5 and verify the current branch's work units survived via `node events/scripts/read.mjs --name meta --unresolved` (and `--name product`). Missing units are re-asserted from the `/tmp` backup via `append-build.mjs`, never by editing the checkpoint by hand.
- Exception — both sides compacted (both checkpoints changed while both logs are near-empty): neither checkpoint alone is complete. Deep-merge the `trees` objects with theirs as the base and ours overlaid (ours wins on leaf conflicts), keep the newer `compactedAt`/`asOf`, write the file, then rebuild. Markers are still never edited by hand.

### 4. Real code (C) — base as the foundation, branch on top

- For each path, read the three stages: `:1:` ancestor, `:2:` ours (current branch), `:3:` theirs (base) via `git show :<n>:<path>`, plus `git log --merge --oneline -- <path>`.
- Keep the base hunk as the foundation and re-apply the current branch's intent on top of it. Whole-file `git checkout --ours/--theirs -- <path>` is prohibited — it silently discards one side. Blindly keeping both markers is prohibited — it leaves duplicate logic.
- Remove all markers, `git add` each resolved path, and confirm `git diff --check` is clean and no `U` entries remain.

### 5. Verify, record, hand back

- Rebuild: `node events/scripts/build.mjs`, then `git add events/`.
- Verify the touched area: `pnpm typecheck` at minimum, plus the relevant `pnpm test:run` and `pnpm lint` for conflicted code paths.
- Record the resolution in the log without changing stages: for each affected work unit, re-assert its current `stage` with text noting the resolution, e.g. `node events/scripts/append-build.mjs --set <key>.status '{"stage":"<same>","text":"<current>＋base取込み・コンフリクト解消済み"}'`, then `git add events/`. If no owning unit is identifiable, ask the user which unit the resolution belongs to instead of guessing.
- Stop in committable state (the merge commit or PR continuation belongs to the caller). Report resolved paths, verification results, and the appended status keys.

## Rules

- Never rebase to resolve; never commit inside this skill.
- Never hand-edit conflict markers in `events/` generated files or the log.
- Never resolve real-code hunks by whole-file side checkout or by keeping both sides unedited.
- Never change a work unit's `stage` as part of the resolution record — stages stay truthful, only the note grows.
