---
name: refactor
description: Refactor code, documentation (including code comments), or both, with mode selection. Use when the user asks to refactor (リファクタして / 整理して), clean up code, tidy up comments/docs, or reduce duplication. Supports three modes — code, doc, or both — and applies different rules depending on whether the target is compaction (diff must shrink) or restructuring/correction (diff direction is free). Never delete WHY-comments, error handling, or content flagged as insufficient; those are out of scope for compaction.
---

# Refactor

A skill for refactoring code and/or documentation, split into two independent tracks (code, doc) that can be run individually or together.

## Core principle

"Diff must shrink" is only valid for a narrow subset of changes — duplicate code, dead code, provably-equivalent simplifications, redundant comments, and duplicated doc content. It is NOT a goal for the whole refactor. Applying it broadly causes real damage: WHY-comments get deleted, error handling gets stripped, function splits get blocked because they add lines.

So every target must first be **labeled**, and only then does a rule apply. Never skip labeling and jump straight to "make it shorter."

## Step 1: Determine mode

Ask or infer from the user's request which mode applies:

- **code** — refactor code logic only
- **doc** — refactor documentation and code comments only
- **both** — run code and doc independently, then present a combined diff

Default to asking if ambiguous (e.g. "just say 'refactor'" with no further context). Don't run both tracks unless the user wants both — running code-only when only docs were requested (or vice versa) wastes the user's review time.

## Step 2: Label every candidate target

Before changing anything, classify each candidate block/comment using the tables below. Do not touch anything until it has a label.

### Code labels

| Label                     | Criteria                                                                                                    | Diff rule                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `duplicate`               | Same/near-same logic appears in 2+ places                                                                   | Must shrink (or stay flat)                          |
| `dead`                    | Statically unreachable / unreferenced                                                                       | Must shrink                                         |
| `equivalent-simplifiable` | Rewrite is provably semantically equivalent (e.g. `if x==true: return true else return false` → `return x`) | Must shrink                                         |
| `needs-restructure`       | Bloated responsibility, tight coupling, poor naming, missing error handling                                 | Free — behavior-preservation is the only constraint |

### Doc labels

| Label                         | Criteria                                                                 | Diff rule                                                 |
| ----------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `redundant-with-code`         | Comment just restates what the code already says (e.g. `// increment i`) | Must shrink                                               |
| `duplicated-across-locations` | Same note/warning copy-pasted in multiple places                         | Must shrink (consolidate to one place)                    |
| `stale-or-incorrect`          | Contradicts current code                                                 | Free — accuracy is the only constraint                    |
| `insufficient`                | Missing explanation the reader needs                                     | Free — never delete to satisfy a compaction goal          |
| `why-explanation`             | Explains a design decision or rationale                                  | Out of scope — wording cleanup only, never delete content |

## Step 3: Apply the matching pass

**Compaction pass** (labels: `duplicate`, `dead`, `equivalent-simplifiable`, `redundant-with-code`, `duplicated-across-locations`)

- Diff must be negative or zero for these lines.
- If tests exist, they must stay green. If not, confirm AST-level (or clearly stated logical) equivalence before applying.
- If a "compaction" change ends up net-positive, stop and explain why in the summary — don't silently let it through.

**Restructuring / correction pass** (labels: `needs-restructure`, `stale-or-incorrect`, `insufficient`, `why-explanation`)

- Diff direction is unconstrained. Do not evaluate these changes by line count.
- Code: judge by duplication rate, cyclomatic complexity, and nesting depth — not line count.
- Docs: judge by accuracy and alignment with current code — not line count.
- Never delete a `why-explanation` or `insufficient` item to hit a length target.

## Step 4: Summarize

When presenting the result, report per label:

- What was compacted (with line delta)
- What was restructured/corrected (with a one-line reason, not a line delta)

This keeps the "diff shrank" claim honest — it only applies to the subset where it was supposed to apply.
