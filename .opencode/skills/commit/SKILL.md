---
name: commit
description: Perform a git commit for a work unit, appending lifecycle transitions first. Use when the user asks to commit (コミットして / 確定して) or when a work unit is complete and ready to be committed. Follows the repo's commit conventions and the driving-system integration (append → commit). Never commit without the user explicitly asking.
---

# Commit

Close out one work unit: append the agreed events, build, then commit everything (code, log, snapshots, docs) together. Never commit unless the user explicitly asked.

## Commit-failure handling

Commit failure points: pre-commit hooks (lint / format / typecheck / sync-config-snapshots). When a commit is rejected:

1. The commit is NOT created; the staged changes remain.
2. Decide which scenario applies:
   - **Log-agnostic fix** (hooks failed on code quality): the agreed events are unchanged — **do NOT append again**. Fix, `git add`, retry.
   - **Implementation drifted from the agreement**: append the delta as new events (2nd batch), then retry.
3. Amending is prohibited after a commit succeeds. Additional events from later discussion belong to the NEXT work unit's commit.

## Procedure

1. **Verify work is done** — tests pass (`pnpm test:run`), format/typecheck clean.
2. **Identify the work unit's agreed events** — collected during implementation; nothing new.
3. **Append lifecycle transitions first** — assert each target's whole status in one event (`{"stage":"commit","text":"<progress>"}`); multiple targets share one invocation: `node events/scripts/append.mjs --set <key>.status '{"stage":"commit","text":"…"}' --set …`, then `node events/scripts/build.mjs` to refresh snapshots. The log and snapshots are committed alongside the code.
4. **Pre-commit inspection**:
   - `git status` — intended files only
   - `git diff` — no secrets, no unintended changes
   - `git log --oneline -10` — match repo message style
5. **Commit** with a concise message following repo conventions (`add:` / `chore:` / `update:` / `fix:`; lowercase, single paragraph).

## Strict no-commit moments

- The user has not asked.
- No implementation/verification yet.
- staged-only preview commits (e.g. `git add` for review) are not requested.

## Lifecycle integration

Lifecycle transitions are appended **before** the commit, so the log and snapshots ship in the same commit as the code:

- Each target that reached a new stage gets one whole-status assertion: `set <key>.status '{"stage":"commit","text":"〇〇まで実装済み"}'`. Stage and progress note always travel together — the shape enforces it.
- Plain value changes and doc updates commit alongside.

If a commit succeeds but lifecycle transitions weren't recorded, append them as part of the NEXT work unit (no amending).
