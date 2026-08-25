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

1. **Get the diff** — run `git diff HEAD` to collect the pending changes. If empty, report "nothing to review" and stop.
2. **Chunk** — group the changed files into reviewable chunks:
   - Map each changed file to its work unit (meta: via the component's `path` in the snapshot; product: by which feature the file implements)
   - One chunk = one work unit's full change set — code, tests, and docs together, so the auditor can cross-check the three viewpoints within the chunk
   - Shared libraries form their own chunk; generated artifacts (log, snapshots) are excluded — covered by build validation
   - If a chunk is too large for one auditor pass, split by cohesion, keeping each sub-group's code, tests, and docs together
3. **Spawn auditors in parallel** — one Task call per chunk with `auditor` as sub agent, passing the chunk: the changed file paths, the diff for those files, and the work-unit context (purpose / definition). The auditor reads the files itself; it does not run git.
4. **Aggregate** — collect the fixed-format findings returned by each auditor.
5. **Digest** — group the findings and add your own assessment: clearly valid, needs user judgment, or likely false positive. Give a recommendation.
6. **Present** — show the findings with your recommendation to the user. Do not fix anything yourself.
7. **Fix** — implement the fixes the user decided on.
8. **Re-review** — re-run the audit on the new diff (steps 1–6). Loop until the audit returns OK or the user stops.

## Rules

- Never modify code during an audit
- Never review outside the diff
- Aggregate auditor findings as-is; do not override the review judgment
- Adoption decisions belong to the user; the main agent only digests and recommends
- Re-review after every fix round — fixes can introduce new issues
