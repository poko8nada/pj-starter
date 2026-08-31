---
name: refactor
description: Refactor code, documentation (including code comments), or both, with mode selection. Use when the user asks to refactor (リファクタして / 整理して), clean up code, tidy up comments/docs, or reduce duplication.
---

# Refactor

A skill for refactoring code and/or documentation, split into two independent tracks (code, doc) that can be run individually or together.

## References

- Log rules: `events/README.md`
- Component inventory: `events/snapshots/product.json` (product) / `events/snapshots/meta.json` (meta) — consult the declared domain's snapshot

## Core principle

"Diff must shrink" is only valid for a narrow subset of changes — duplicate code, dead code, provably-equivalent simplifications, redundant comments, and duplicated doc content. It is NOT a goal for the whole refactor. Applying it broadly causes real damage: WHY-comments get deleted, error handling gets stripped, function splits get blocked because they add lines.

So every target must first be **labeled**, and only then does a rule apply. Never skip labeling and jump straight to "make it shorter."

## Step 1: Determine mode and domain

Ask or infer from the user's request:

- **Mode** — which track applies:
  - **code** — refactor code logic only
  - **doc** — refactor documentation and code comments only
  - **both** — run code and doc independently, then present a combined diff
- **Domain** — which layer the refactor targets:
  - **product** — product code and product features
  - **meta** — the driving machinery (harness, skills, agents, docs, scripts)

Infer both from the request (e.g. "auth をリファクタ" → code + product; "agenda スキルを整理" → doc + meta); default to asking if ambiguous. The domain sets the consultation scope for Steps 2-3 — a default, not a hard gate: candidates mapping to the other domain are still handled.

## Step 2: Discover candidates via the explore subagent

Delegate the search to the built-in `explore` subagent — do not walk the tree yourself. This keeps the main thread on judgment, not navigation.

- Give it the **domain, mode, and the search lens** below as its scan instructions
- Request a candidate list with **`file:line` and a one-line reason** per candidate
- Set thoroughness by scope: whole-domain sweep → `very thorough`; a clearly bounded area → `medium`
- The subagent returns **candidates, not labels** — labeling is a judgment task and stays here (Step 3)

### Search lens

In addition to the label criteria below, have the subagent look for **module-resolution health**:

- **[product]** import alias use: `tsconfig` `paths` declarations and whether imports honor them
- **[all]** dynamic `import()`/`require()` root-path resolution: Node ESM does **not** resolve `tsconfig` `paths` — a `.mjs`/`.cjs` dynamic import using an alias typechecks but breaks at runtime. This is where moving files under a refactor silently breaks a `?t=` cache-busting import (`scripts/user/sync/meta.mjs` is the known example)
- **[all]** broken relative paths and imports pointing at non-existent modules

## Step 3: Label every candidate target

Before changing anything, classify each candidate block/comment using the tables below. Do not touch anything until it has a label.

While labeling, also identify the **touched components**: match the candidate locations against component `path`s in the declared domain's snapshot — `events/snapshots/product.json` for product, `events/snapshots/meta.json` for meta. Locations matching no component are raw code — they have no status to assert. Candidates mapping to the other domain are still handled (the domain is a consultation default, not a hard gate).

If labeling reveals that a component's **definition** (trigger/result/route or purpose) has drifted from reality, do not refactor around it — route to the feature skill for a definition revision, then restart.

### Code labels

| Label                     | Criteria                                                                                                                                                                               | Diff rule                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `duplicate`               | Same/near-same logic appears in 2+ places                                                                                                                                              | Must shrink (or stay flat)                          |
| `duplicate-with-reason`   | Duplicate is intentional: each instance must function independently in its own context (e.g. subagent frontmatter, per-directory declarations). Consolidation would break independence | Out of scope — do not merge; keep each instance     |
| `dead`                    | Statically unreachable / unreferenced                                                                                                                                                  | Must shrink                                         |
| `equivalent-simplifiable` | Rewrite is provably semantically equivalent (e.g. `if x==true: return true else return false` → `return x`)                                                                            | Must shrink                                         |
| `needs-restructure`       | Bloated responsibility, tight coupling, poor naming, missing error handling                                                                                                            | Free — behavior-preservation is the only constraint |

### Doc labels

| Label                         | Criteria                                                                 | Diff rule                                                 |
| ----------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `redundant-with-code`         | Comment just restates what the code already says (e.g. `// increment i`) | Must shrink                                               |
| `duplicated-across-locations` | Same note/warning copy-pasted in multiple places                         | Must shrink (consolidate to one place)                    |
| `stale-or-incorrect`          | Contradicts current code                                                 | Free — accuracy is the only constraint                    |
| `insufficient`                | Missing explanation the reader needs                                     | Free — never delete to satisfy a compaction goal          |
| `why-explanation`             | Explains a design decision or rationale                                  | Out of scope — wording cleanup only, never delete content |

## Step 4: Human review of labels (required)

Before applying any changes, present to the user:

1. A list of all candidate locations with the label you assigned
2. A one-line reason for each label
3. The touched components (matched against snapshots) — or "none"
4. Ask: "これらのラベル付けで進めてよいですか？ 修正したいラベルがあれば指示してください。"

Do not proceed to Step 5 until the user explicitly approves (or provides corrections).

## Step 5: Apply the matching pass

**Compaction pass** (labels: `duplicate`, `dead`, `equivalent-simplifiable`, `redundant-with-code`, `duplicated-across-locations`)

- Diff must be negative or zero for these lines.
- If tests exist, they must stay green. If not, confirm AST-level (or clearly stated logical) equivalence before applying.
- If a "compaction" change ends up net-positive, stop and explain why in the summary — don't silently let it through.

`duplicate-with-reason` is intentionally **excluded** from this pass — its whole point is that merging would break independence. Report it as out-of-scope in the summary, never fold it into compaction.

**Restructuring / correction pass** (labels: `needs-restructure`, `stale-or-incorrect`, `insufficient`, `why-explanation`)

- Diff direction is unconstrained. Do not evaluate these changes by line count.
- Code: judge by duplication rate, cyclomatic complexity, and nesting depth — not line count.
- Docs: judge by accuracy and alignment with current code — not line count.
- Never delete a `why-explanation` or `insufficient` item to hit a length target.

## Step 6: Summarize

When presenting the result, report per label:

- What was compacted (with line delta)
- What was restructured/corrected (with a one-line reason, not a line delta)
- What was `duplicate-with-reason` (kept as-is, with the reason)

This keeps the "diff shrank" claim honest — it only applies to the subset where it was supposed to apply.

## Status semantics

- On label approval (step 4): assert `ready` for every touched managed component. One status assertion per target, all in one invocation — `node events/scripts/append-build.mjs --set <key>.status '{"stage":"ready","text":"<progress>"}'`
- On completion (step 6): assert `implement` — the refactor is applied, awaiting commit
- At commit: the commit skill asserts `commit` — never assert it from here
- No manual build: the idle hook syncs snapshots after the turn ends
