---
name: commit
description: Perform a git commit for a work unit, appending status assertions first. Use when the user asks to commit (コミットして / 確定して) or when a work unit is complete and ready to be committed. Follows the repo's commit conventions and the driving-system integration (append → commit). Never commit without the user explicitly asking.
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
2. **Identify the components the change touches** — match changed files against component `path`s in `events/snapshots/meta.json` (and `product.json` for product slices).
3. **Append status assertions mechanically** — for every touched component, assert `{"stage":"commit","text":"<今回の変更内容>"}`. No stage-transition judgment: always write `commit`, even when the component was already `commit` (the text is updated). `text` states only what changed this time — no reasons, no progress explanations. Multiple targets share one invocation: `node events/scripts/append.mjs --set <key>.status '{"stage":"commit","text":"…"}' --set …`, then `node events/scripts/build.mjs` to refresh snapshots. The log and snapshots are committed alongside the code.
4. **Pre-commit inspection**:
   - `git status` — intended files only
   - `git diff` — no secrets, no unintended changes
   - `git log --oneline -10` — match repo message style
5. **Propose the commit message** — present the structured message to the user in chat and wait for approval or corrections:

   ```
   <type>(<scope>): <imperative subject in English, ≤50 chars, no period>

   Why: なぜこの変更が必要か
   What: 何を変えたか
   How: どう実装したか（自明な場合は省略）
   ```

   - Types: `feat` / `fix` / `docs` / `chore` — MECE, decide by definition only:

     | type    | definition                                    |
     | ------- | --------------------------------------------- |
     | `feat`  | new feature / new component                   |
     | `fix`   | bug fix (correcting misbehavior)              |
     | `docs`  | docs-only change                              |
     | `chore` | everything else (refactor, config, ops, deps) |

   - Scope mirrors the component id (e.g. `(agenda-skill)`, `(event-log)`); omit for repo-wide changes. Decide by the decision tree:

     ```
     Does the change fit one component?
     ├─ yes → that component id
     └─ no (spans multiple / unknown) → omit
     ```

   - Subject is English imperative; body is Japanese in plain form (「〜した」), wrapped at ~72 chars; labels stay English. Blank line between subject and body.

6. **Commit** — execute `git commit` only after the user approves the message.

## Strict no-commit moments

- The user has not asked.
- No implementation/verification yet.
- staged-only preview commits (e.g. `git add` for review) are not requested.

## Lifecycle integration

Status assertions are appended **before** the commit, so the log and snapshots ship in the same commit as the code:

- Every touched component gets one whole-status assertion: `set <key>.status '{"stage":"commit","text":"<今回の変更内容>"}'`. Always `commit` — no stage-transition judgment. Stage and text always travel together — the shape enforces it.
- Plain value changes and doc updates commit alongside.

If a commit succeeds but status assertions weren't recorded, append them as part of the NEXT work unit (no amending).
