---
name: prune
description: Curate tests by deletion and integration. Use when the user asks to prune tests (テスト整理して / 刈り込んで / テストを減らして).
---

# Prune

Curate the test suite: inventory every test, label deletion/integration candidates, apply the approved cull, and kill-check the survivors. Guarantee versus cost is the only axis — never count or coverage.

## References

- Log rules: `events/README.md`
- Component inventory: `events/snapshots/product.json` (product) / `events/snapshots/meta.json` (meta)
- Tests live next to their source as `*.test.ts` and run via `pnpm test:run`

## Step 1: Inventory via the explore subagent

Delegate the search to the built-in `explore` subagent — do not walk the tree yourself.

- Give it the full test inventory as scan instructions: every `*.test.ts` with its subject, assertion target, mocked boundaries, and cost signals (runtime, flakiness history, fix burden)
- Request candidates as sets: each test with its subject and mocks, every location with **`file:line` and a one-line reason**
- Set thoroughness by scope: whole-suite sweep → `very thorough`; a bounded area → `medium`

## Step 2: Label every test

Before changing anything, classify each test. Do not touch anything until it has a label.

| Label                      | Criteria                                                 |
| -------------------------- | -------------------------------------------------------- |
| `implementation-copy`      | Restates the implementation instead of the specification |
| `mock-self-check`          | Verifies the mock itself, not the behavior               |
| `type-library-reassurance` | Re-checks what types or libraries already guarantee      |
| `duplicate`                | Another test already guards the same defect              |
| `internals-dependent`      | Over-depends on internals; breaks on every refactor      |
| `excessive-split`          | Case split beyond any realistic defect distinction       |
| `keeps-value`              | Kept — with the realistic defect missed if deleted       |

Deletion test for every label: what realistic defect would be missed if deleted. Never keep just in case; weigh runtime, flakiness, and fix burden against guarantee value. Bug-report-derived and spec-disambiguating tests default to `keeps-value` even when they look duplicative — check history before labeling them.

While labeling, also identify the **touched components**: match each test plus its subject against component `path`s in the snapshots. Unmatched locations are raw and carry no status.

## Step 3: Present the prune plan (required)

Group the labeled tests by outcome in the format below. Wait for approval. Labels are tags at the end of each line, never headings.

```markdown
## Prune plan

### Delete

- `<path>:<line>` — <missed defect: none realistic> / `<label>`

### Integrate

- `<path>:<line>` → `<target test>` — <what merges> / `<label>`

### Keep

- `<path>:<line>` — <missed defect if deleted> / `keeps-value`

### Components

- `<component>` — <what happens>
- none
```

Ask: "この案で進めてよいですか？ 修正したい点があれば指示してください。"

Do not proceed to Step 4 until the user explicitly approves (or provides corrections).

## Step 4: Apply and kill-check

- Apply only the approved delete/integrate list. Fold integrated cases into their target test; leave no orphans.
- Kill-check every survivor group: break the subject once and confirm the test falls, then restore. A test that stays green on broken code is re-labeled and removed.
- Run `pnpm test:run` — the suite must be green at the end.

## Step 5: Summarize

Report per outcome: deleted, integrated, kept (with the missed-defect reason), the kill-check result, and the suite delta (count and time). Never claim coverage as the achievement.

## Status semantics

- On plan approval (step 3): assert `ready` for every touched managed component. One status assertion per target, all in one invocation — `node events/scripts/append-build.mjs --set <key>.status '{"stage":"ready","text":"<progress>"}'`
- On completion (step 4): assert `implement` — the prune is applied, awaiting commit
- At commit: the commit skill asserts `commit` — never assert it from here
- No manual build: snapshots refresh via the canonical path (see events/README.md)
