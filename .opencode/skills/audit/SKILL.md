---
name: audit
description: Review pending changes before commit. Use when the user asks to review before committing (コミット前にレビューして / 監査して / audit して). Delegates the review to auditor sub-agents spawned in parallel per chunk.
---

# Audit

Pre-commit code review. The main agent handles scope and aggregation; the auditor sub-agents do the review.

## Responsibilities

|        | Main agent (YOU)                | auditor                           |
| ------ | ------------------------------- | --------------------------------- |
| Scope  | Get the diff, split into chunks | Receive the chunk only            |
| Review | Never                           | 3 viewpoints (logic / test / doc) |
| Fix    | Never (present findings only)   | Never                             |
| Output | Aggregate and present findings  | Return findings in a fixed format |

## Procedure

1. **Get the diff** — `git diff HEAD`. Empty → report "nothing to review" and stop.
2. **Check unresolved components** — `node events/scripts/read.mjs --name meta --unresolved` (and `--name product`). Note any `ready`/`implement` components outside this audit's diff (left uncommitted earlier). Include in the digest for the user to withdraw (`del`) or carry over.
3. **Chunk** — group changed files into reviewable chunks:
   - Map each file to its work unit (meta: component `path`; product: feature)
   - One chunk = one work unit's full change set (code + tests + docs) so the auditor can cross-check the three viewpoints
   - Shared libraries form their own chunk; generated artifacts (`log.jsonl`, `snapshots/`) excluded — covered by build validation
   - Oversized chunk → split by cohesion, keeping each sub-group's code/tests/docs together
4. **Spawn auditors in parallel** — one Task per chunk with `auditor`, passing: changed file paths, the diff, and the work-unit context (purpose / definition / test policy from the agenda plan's Tests). The auditor reads files itself; it does not run git.
5. **Aggregate** — collect the fixed-format findings from each auditor.
6. **Digest** — group findings, add your assessment (clearly valid / needs user judgment / likely false positive), recommend. Fold in unresolved components from step 2.
7. **Present** — show findings + recommendation. Do not fix anything yourself.
8. **Fix** — implement the fixes the user decided on.
9. **Re-review** — re-run on the fixes only: the incremental diff is the changes made during the fix round (the files edited since the last review). Delegate ONLY the adopted findings + that diff. Auditor verifies resolution, must NOT raise new findings. Loop until OK or the user stops.

## Rules

- Never modify code during an audit
- Never review outside the diff
- Aggregate auditor findings as-is; do not override the review judgment
- Adoption decisions belong to the user; the main agent only digests and recommends
- Re-review after every fix round — verify the adopted fixes resolved the findings; new issues surface in the next full audit round
