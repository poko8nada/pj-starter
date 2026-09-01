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

## Base branch determination (dev rule)

Determine the base from the fork point of the current branch:

1. Candidates: `main` and `develop` (the repo's trunk branches).
2. Compute `mb_dev = git merge-base develop HEAD` and `mb_main = git merge-base main HEAD`.
3. Base = `develop` if `mb_dev` is a **strict descendant** of `mb_main` (i.e. `mb_dev != mb_main` and `git merge-base --is-ancestor mb_main mb_dev` succeeds); otherwise base = `main`.

This makes "branched from dev → target dev, branched from main → target main" deterministic. Present the result to the user for confirmation.

## Title and body

Reuse the commit message convention:

- **Title**: the work unit commit's subject (`<type>(<scope>): <subject>`)
- **Body**: the commit body (Why/What/How) plus 動作確認 and レビューポイント

## Procedure

1. **Pre-flight checks**:
   - Current branch is not a trunk (`main` / `develop`)
   - Working tree is clean (all committed)
   - No existing open PR for this branch — `gh pr list --head <branch> --state open --json number`; if one exists, report it and stop
   - Push the branch if not yet pushed — `git push -u origin <branch>`
2. **Determine the base branch** — dev rule above.
3. **Draft the PR** — title and body from the commit convention.
4. **Propose** — present title, body, and base to the user; wait for approval or corrections.
5. **Create** — non-interactive, all flags supplied:
   `gh pr create --base <base> --head <branch> --title "<title>" --body "<body>"`
6. **Report** — present the PR URL.

## Strict no-PR moments

- The user has not asked.
- No commit yet for the work unit.
- The current branch is a trunk branch.
