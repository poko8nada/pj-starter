---
name: refactor
description: Restructure code and/or documentation without changing behavior or definitions. Use when the user asks to refactor (リファクタして / 整理して) or clean up within the existing structure. No new identifiers, no definition changes.
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
- Request candidates as sets: each candidate block with its callers and the tests asserting it, every location with **`file:line` and a one-line reason**
- Set thoroughness by scope: whole-domain sweep → `very thorough`; a clearly bounded area → `medium`
- The subagent returns **candidates, not labels** — labeling is a judgment task and stays here (Step 3)

### Search lens

In addition to the label criteria below, have the subagent look for **module-resolution health**:

- **[product]** import alias use: `tsconfig` `paths` declarations and whether imports honor them
- **[all]** dynamic `import()`/`require()` root-path resolution: Node ESM does **not** resolve `tsconfig` `paths` — a `.mjs`/`.cjs` dynamic import using an alias typechecks but breaks at runtime. This is where moving files under a refactor silently breaks a `?t=` cache-busting import (`scripts/user/apply/meta.mjs` is the known example)
- **[all]** broken relative paths and imports pointing at non-existent modules
- **[all]** receiver closure: for each candidate, its callers (importers included), the readers and writers of artifacts it touches (spawned paths, snapshot / checkpoint shapes), and the tests asserting those shapes
- **[all]** contract changes: alterations to a shared shape (snapshot projection, checkpoint trees, lib API) whose consumers and tests must change together

### WHY evidence hierarchy (for `why-stale` / `why-missing`)

WHY must never be invented. Resolve it top-down and record which source was used:

1. Snapshot definitions — product `trigger` / `result`, meta `purpose` (primary source)
2. `git log` / `blame` on the touched lines
3. Recent implementation chat in the current session (strongest right after implementation; gone in later single-shot runs)

If none of the above yields evidence, do not write a WHY — present it as a candidate with its basis, or leave a `TODO(why):` marker for the user.

## Step 3: Label every candidate target

Before changing anything, classify each candidate block/comment using the tables below. Do not touch anything until it has a label.

While labeling, also identify the **touched components**:

- Match — match the candidate locations plus their callers and tests against component `path`s in the declared domain's snapshot — `events/snapshots/product.json` for product, `events/snapshots/meta.json` for meta.
- Raw — locations matching no component are raw code — they have no status to assert.
- Cross-domain — candidates mapping to the other domain are still handled (the domain is a consultation default, not a hard gate).

If labeling reveals that a component's **definition** (trigger/result/route or purpose) has drifted from reality, do not refactor around it — route to the feature skill for a definition revision, then restart.

### Code labels

**Compaction**

Shrink-natured. Self-contained; no review engine owns these.

| Label                     | Criteria                          | Diff rule               |
| ------------------------- | --------------------------------- | ----------------------- |
| `duplicate`               | Same/near-same logic in 2+ places | Must shrink (or flat)   |
| `duplicate-with-reason`   | Intentional duplication *         | Out of scope, keep each |
| `dead`                    | Unreachable / unreferenced        | Must shrink             |
| `equivalent-simplifiable` | Provably equivalent rewrite **    | Must shrink             |

\* Each instance must function independently in its own context (e.g. subagent frontmatter, per-directory declarations); consolidation would break independence.
\** E.g. `if x==true: return true else return false` → `return x`.

**Structure**

Structural judgment lives in `arch-auditor.md` — read it before labeling. This skill owns only the diff rules:

- `needs-restructure` → Free (preserve behavior)
- `contract-change` → Free (consumers + tests ride along)

### Doc labels

Doc-behavior judgment lives in `doc-auditor.md` — read it before labeling. This skill owns only the diff rules:

- `redundant-with-code` and `duplicated-across-locations` → Must shrink
- `stale-or-incorrect` → Free (accuracy only)
- `insufficient` → Free (never delete)
- `why-accurate` → out of scope (wording only)
- `why-stale` / `why-missing` → Free (update / add with evidence)

\* Supplementary Japanese comments are never `redundant-with-code` — even restating ones aid Japanese readers.

## Step 4: Present the refactor plan (required)

Group the labeled candidates by outcome and present them in the format below. Wait for approval. Labels are tags at the end of each line, never headings. For functions, append the signature; for docs, append the heading. Placeholders only — fill them per case.

```markdown
## Refactor plan

### Compact

- `<path>:<line>` — <what changes> / `<label>`

### Restructure

- `<path>:<line>` `<name>(<args>)` — <what changes> → <expected shape> / `<label>`
- `<path>` `## <heading>` — <what changes> → <expected shape> / `<label>`

### Keep

- `<path>:<line>` — <why it stays> / `<label>`

### Components

- `<component>` — <what happens>
- none

### WHY

- `<path>:<line>` — <draft> / evidence: <source>
- TODO(why): <what is missing>
```

For every inferred WHY (`why-stale` / `why-missing`): include the drafted text plus its evidence source (snapshot key, commit, or chat basis). Without evidence, present a `TODO(why):` marker or an open question instead — never a drafted explanation.

Ask: "この案で進めてよいですか？ 修正したい点があれば指示してください。"

Do not proceed to Step 5 until the user explicitly approves (or provides corrections).

## Step 5: Apply the matching pass

**Compaction pass** (labels: `duplicate`, `dead`, `equivalent-simplifiable`, `redundant-with-code`, `duplicated-across-locations`)

- Diff must be negative or zero for these lines.
- If tests exist, they must stay green. If not, confirm AST-level (or clearly stated logical) equivalence before applying.
- If a "compaction" change ends up net-positive, stop and explain why in the summary — don't silently let it through.

`duplicate-with-reason` is intentionally **excluded** from this pass — its whole point is that merging would break independence. Report it as out-of-scope in the summary, never fold it into compaction.

**Restructuring / correction pass** (labels: `needs-restructure`, `contract-change`, `stale-or-incorrect`, `insufficient`, `why-stale`, `why-missing`, `why-accurate`)

- Diff direction is unconstrained. Do not evaluate these changes by line count.
- Code: judge by duplication rate, cyclomatic complexity, and nesting depth — not line count.
- Docs: judge by accuracy and alignment with current code — not line count.
- Never delete a `why-accurate`, `why-missing`, or `insufficient` item to hit a length target.
- Never invent a WHY: every `why-stale` / `why-missing` change cites its evidence source from the hierarchy above. Without evidence, leave a `TODO(why):` or an open question instead of writing the explanation.

## Step 6: Summarize

When presenting the result, report per label:

- What was compacted (with line delta)
- What was restructured/corrected (with a one-line reason, not a line delta)
- What was `duplicate-with-reason` or `why-accurate` (kept as-is, with the reason)

This keeps the "diff shrank" claim honest — it only applies to the subset where it was supposed to apply.

## Status semantics

- On label approval (step 4): assert `ready` for every touched managed component. One status assertion per target, all in one invocation — `node events/scripts/append-build.mjs --set <key>.status '{"stage":"ready","text":"<progress>"}'`
- On completion (step 6): assert `implement` — the refactor is applied, awaiting commit
- At commit: the commit skill asserts `commit` — never assert it from here
- No manual build: snapshots refresh via the canonical path (see events/README.md)
