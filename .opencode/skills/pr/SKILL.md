---
name: pr
description: Create a pull request for a committed work unit. Use when the user asks to create a PR (PR出して / プルリク出して) after a commit. Single PR only — stacked PRs are out of scope. Determines the base branch from the fork point (dev rule), reuses the commit message convention for title/body, and never appends to the event log.
---

# PR

Deliver a committed work unit to the remote as a single pull request. Triggered only after a commit; never part of the workflow skill's patterns.

## Scope

- Single PR per branch. Stacked PRs (gh-stack) are out of scope.
- PR creation only — merging is out of scope.
- Not part of the workflow skill.

## Event log

PR creation does **not** append to the event log. The work unit lifecycle ends at commit; a PR is a GitHub-side artifact. Appending would reintroduce post-commit log noise and create stale state (PR state — merged/closed — diverges from the log).

## Base branch determination

Determine the base from the current branch:

- Current branch is `develop` → base = `main` (release PR from the integration branch)
- Otherwise → dev rule: compute `mb_dev = git merge-base develop HEAD` and `mb_main = git merge-base main HEAD`. Base = `develop` if `mb_dev` is a **strict descendant** of `mb_main` (i.e. `mb_dev != mb_main` and `git merge-base --is-ancestor mb_main mb_dev` succeeds); otherwise base = `main`.

This makes "branched from dev → target dev, branched from main → target main, on develop → target main" deterministic. Present the result to the user for confirmation.

## Title and body

Reuse the commit message convention. Title is English; body text is Japanese (labels and headings stay English).

- **Title** — the work unit commit's subject:

  ```
  <type>(<scope>): <imperative subject in English, ≤50 chars, no period>
  ```

- **Body** — the commit body (Why/What/How) plus Verification and Review focus:

  ```md
  Why: なぜこの変更が必要か
  What: 何を変えたか
  How: どう実装したか（自明な場合は省略）

  ## Verification

  - <実行コマンド> → <期待結果>
  - <手動確認手順> → <期待結果>

  ## Review focus

  - <リスク/判断を伴う箇所（ファイルや領域を特定）>
  - <特に見てほしい設計判断>
  ```

  - **Verification** — 変更が意図どおり動くことを確認する手順。各項目は「実行 → 期待結果」の形で書く。自動チェック（`pnpm test:run` / `typecheck` / `lint`）と、自動でカバーされない手動確認を列挙する。曖昧な記述（「動作確認済み」等）は禁止
  - **Review focus** — レビュアーが特に注視すべき点。リスクや設計判断を伴う箇所をファイルや領域を特定して列挙する。漠然とした一般論（「コード全体」等）は禁止

## Procedure

1. **Determine the base branch** — dev rule above.
2. **Pre-flight checks**:
   - Current branch is not `main` (the stable trunk)
   - Working tree is clean (all committed)
   - No existing open PR for this branch — `gh pr list --head <branch> --state open --json number`; if one exists, report it and stop
   - Fetch the base — `git fetch origin <base>`
   - Sync with the base — `git merge <base>` into the branch. The merge driver auto-resolves `events/log.jsonl`; check with `git status --short events/log.jsonl`: if the log changed, run `node events/scripts/build.mjs` and commit the resolution. If conflicts appear outside the log, stop and resolve them before continuing
   - Push the branch so the remote has all local commits — `git push -u origin <branch>` (no-op when up to date)
3. **Draft the PR** — title and body from the commit convention.
4. **Propose** — present title, body, and base to the user; wait for approval or corrections.
5. **Create** — non-interactive, all flags supplied:
   `gh pr create --base <base> --head <branch> --title "<title>" --body "<body>"`
6. **Report** — present the PR URL.

## Updating a stale PR

When the base moved after PR creation (another PR merged first):

1. Merge the base into the branch — `git merge <base>` (merge, not rebase: the merge driver auto-resolves `events/log.jsonl`)
2. Rebuild — `node events/scripts/build.mjs`, verify snapshots reflect the merged log
3. Commit the rebuilt snapshots, then push — `git push origin <branch>`; the PR updates itself

## Strict no-PR moments

- The user has not asked.
- No commit yet for the work unit.
- The current branch is a trunk branch.
