---
name: audit
description: Review pending changes before commit. Use when the user asks to review before committing (コミット前にレビューして / 監査して / audit して). Delegates the review to engine sub-agents spawned in parallel per chunk (logic-test / doc / a11y / arch).
---

# Audit

Pre-commit code review. The main agent handles scope and aggregation; the four engine sub-agents do the review.

## Responsibilities

|        | Main agent (YOU)                | engines (logic-test / doc / a11y / arch)          |
| ------ | ------------------------------- | ------------------------------------------------- |
| Scope  | Get the diff, split into chunks | Receive the chunk only (arch: plus related files) |
| Review | Never                           | One viewpoint each (see below)                    |
| Fix    | Never (present findings only)   | Never                                             |
| Output | Merge and sort all findings     | Flat severity-sorted bullets                      |

Engines: `logic-test-auditor` (behavior + tests as a pair), `doc-auditor` (comments + docs vs behavior), `a11y-auditor` (static accessibility checks, UI chunks only), `arch-auditor` (placement, splitting, reference structure against trajectory).

## Output schema (normative)

Every engine returns one finding per line, sorted high first. `OK` when clean:

```
- [high|med|low] <file>:<line> — <finding> (<basis>)
```

Severity orders the list; recommendation strength lives in the wording. Each engine's file duplicates this block; this section is the source of truth.

## Procedure

1. **Get the diff** — `git diff HEAD`. Empty → report "nothing to review" and stop.
2. **Check unresolved components** — `node events/scripts/read.mjs --name meta --unresolved` (and `--name product`). Note any `ready`/`implement` components outside this audit's diff (left uncommitted earlier). Include in the digest for the user to withdraw (`del`) or carry over.
3. **Scope** — default to the whole diff as one unit (one Task per engine, 4 total). Measure first via `git diff --stat`; split along work-unit boundaries only when oversized — more than 8 files, more than 400 diff lines, or spanning 3+ work units:
   - Map each file to its work unit (meta: component `path`; product: feature)
   - A split chunk = one work unit's full change set (code + tests + docs) so the engines see the full set
   - Shared libraries form their own chunk when splitting; generated artifacts (`log.jsonl`, `snapshots/`) excluded always — covered by build validation
   - Below the bar, still split when contexts mix; above it, stay whole for a single cohesive unit. The numbers are a guide, not a gate
4. **Spawn engines in parallel** — per chunk, one Task per engine (`logic-test-auditor`, `doc-auditor`, `a11y-auditor`, `arch-auditor`). Write the chunk diff to `/tmp/audit-<chunk>.diff` via `git diff HEAD -- <chunk paths>` (unique name per chunk, single-turn handoff only) and pass: changed file paths, the diff file path, and the work-unit context (purpose / definition / test policy from the agenda plan's Tests). The `arch-auditor` additionally receives related files (callers, neighbors, directory listing) — it alone may read outside the chunk, only from that list. Engines read the diff file and the files themselves; they do not run git.
5. **Aggregate** — merge the four flat lists per chunk into one, re-sorted high → med → low.
6. **Digest** — group findings, add your assessment (clearly valid / needs user judgment / likely false positive), recommend. Fold in unresolved components from step 2.
7. **Present** — show findings + recommendation. Do not fix anything yourself.
8. **Fix** — implement the fixes the user decided on.
9. **Re-review** — re-run on the fixes only: the incremental diff is the changes made during the fix round (the files edited since the last review). Delegate ONLY the adopted findings + that diff per engine (via a diff file as in step 4). Each engine verifies resolution, must NOT raise new findings. Loop until OK or the user stops.

## Rules

- Never modify code during an audit
- Never review outside the diff (`arch-auditor` reads only the handed related files beyond it)
- Merge engine findings as-is and re-sort; do not override the review judgment
- Adoption decisions belong to the user; the main agent only digests and recommends
- Re-review after every fix round — verify the adopted fixes resolved the findings; new issues surface in the next full audit round
