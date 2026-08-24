---
name: commit
description: Perform a git commit for a work unit, then record lifecycle transitions. Use when the user asks to commit (コミットして / 確定して) or when a work unit is complete and ready to be committed. Follows the repo's commit conventions and the driving-system integration (append → commit). Never commit without the user explicitly asking.
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
3. **Append** via batch mode `node events/scripts/append.mjs --file <draft.jsonl>` — then `node events/scripts/build.mjs` to refresh snapshots.
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

After a successful commit, assert lifecycle transitions for the work unit's targets:

- Set `<key>.stage = "commit"` for targets that reached it (deep-key append, batch mode).
- Plain value changes and doc updates commit alongside.

If a commit succeeds but lifecycle transitions weren't recorded, append them as part of the NEXT work unit (no amending).
