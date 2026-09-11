---
name: agenda
description: Turn an implementation decision into an agreed plan, then record it. Use when the user decides to build something (実装しよう / 作ろう), says "agenda", or asks to plan work (作業単位). Reads current code, agrees on a report of conventions and debt, plans keep-vs-rebuild orders from that report, reviews twice with narrow checks, and records ready on agreement.
---

# Agenda

Turn an implementation decision into an agreed plan, then record it. Never implement inside agenda.

## Scope

- Idea capture ("ログインを作りたい") is not agenda — plain discussion: once agreed, append directly (new entries enter as `planned`).
- Pure value changes (copy tweaks, status flips) skip agenda — append directly.
- When unsure whether something counts as implementation, run agenda.
- One agenda = one coherent deliverable carried by one or more related targets in the same domain; split unrelated areas into separate sessions.

## Procedure

### 0. Reviewers

Audit runs on four engines. Read all four bodies first (`.opencode/agent/*-auditor.md`), then carry the relevant viewpoints into Report and Plan:

- `logic-test-auditor`: behavior and tests as a pair
- `doc-auditor`: comments and docs vs behavior
- `a11y-auditor`: static checks where UI markup exists
- `arch-auditor`: placement and trajectory — hand it callers and neighbors through Files

### 1. Target

Decide product or meta and pick one or more related target keys in that same domain from snapshots. Product and meta never mix in one agenda — when both are needed, run separate linked agendas.

- Product targets: `product.features.<id>` entries with trigger / result / route.
- Meta targets: `meta.<section>.<id>` entries with purpose (+ `path` once it exists).
- Check every target; if any definition is missing, drifted from reality, or too large for one session, hand off to the feature skill (register / revise / split), then restart agenda from scratch.
- If the targets or orders grow large, consider splitting into smaller agendas.

Output: domain + target keys, one line each.

- Then check Product context (one glance, never blocking): read `product.name` / `what` / `stack` / `look` / `features` / `roadmap` / `deploy` from snapshots and note missing or drifted sections. Per section decide to fill now, defer with a reason, or nurture in parallel with implementation.

### 2. Report

Goal: agree on the current inventory. No design decisions here.

1. Read the files touching all targets (their union). Close the list over receivers: the target files themselves, their callers, the readers and writers of every artifact they touch (spawned script paths, snapshot / checkpoint shapes), and the tests asserting those shapes, plus same-directory siblings and shared types only as needed. Every neighbor left out needs a boundary reason in the report.
2. Write the report in chat in the format below and wait for user approval. If rejected, revise and repeat.
3. Spawn `agenda-reviewer` in `report` mode (facts only — narrow check). Fold every finding (fix or defer with a reason, never silently drop), present report + findings to the user, and iterate until explicit agreement on reality.

```markdown
## Report

- Targets:
  - `product.features.auth`
  - `product.features.auth-session` (or meta keys)
- Files:
  - `<path>`: <one-line role>
- Behavior: <what the code currently does, traceable to the trigger → result path (product) or the purpose path (meta), 1-2 lines, no abstract intent>
- Conventions: <upheld patterns + violations, each with `file:line` evidence, or `none`>
- Debt: <future tech-debt candidates with impact, each with `file:line` evidence, or `none`>
- Product context: <per fact section — present / missing / drifted, and fill-now / defer-with-reason / nurture-in-parallel>
```

Evidence rule: every Conventions / Debt entry cites `file:line`. No speculation beyond the code.

The approved report is the premise for step 3. Files outside it stay untouched unless the plan justifies the addition and the report is updated first.

### 3. Plan

Goal: decide what rides on the conventions and what must break for the debt, as concrete orders.

1. For each file in the approved report, mark `keep` (rides on the conventions, adds no debt) or `rebuild` (must break to address a Debt item, citing which one).
2. Write minimal orders in the format below. Each order is independently verifiable; `Depends on` references earlier numbers only. Every `rebuild` traces to a Debt item and every `keep` rides on a stated Convention. A Debt item with no order needs a defer-with-reason recorded in `## Debt`, never a silent drop. Creation orders with no existing code ride on the snapshot definition (trigger / result / route or purpose) with Conventions / Debt as `none (with reason)`.
3. Spawn `agenda-reviewer` in `plan` mode (consistency only — narrow check). Fold every finding the same way, present plan + findings to the user, and iterate until explicit agreement.

```markdown
# Agenda: <short title>

Domain: <product | meta>

## Targets (from snapshot, read-only)

- `<target key>`: Trigger / Result / Route, or Purpose (+ Stage)
- (repeat per target)

## Files

- `<path>` — keep: <which convention it rides on>
- `<path>` — rebuild: <which Debt item it addresses>

## Debt

- `<Debt item>` → order `<n>` or deferred: <reason>
- (repeat per Debt item, or `none`)

## Orders

### 1. <what to do> (keep | rebuild)

- Target: `<one of the listed targets>`
- Depends on: none
- Files:
  - `<path>` (create | modify)
    - <change>
- Tests:
  - <test file and scope, or `none (with reason)`>
- Check:
  - <command or behavior proving trigger → result (product) or purpose fulfillment (meta)>
```

Test policy: UI / markup → none. Pure functions (fold, validators, formatters) → unit tests for happy path and error paths. Boundaries (CLI, shell, I/O) → boundary tests including failure modes. Keep the minimum set that catches regressions. Tests live next to their source as `*.test.ts` and run via `pnpm test:run`.

If refactor + feature cannot share one session, this agenda carries the full refactor and the feature follows in a later cycle. Refactor orders verify behavior preservation (existing tests stay green).

### 4. Record

On consensus, assert one status per target:

`node events/scripts/append-build.mjs --set <key>.status '{"stage":"ready","text":"<progress>"}'`

Multiple targets can share one invocation (one shared ts). When the agreed work changes important state, co-append the sibling `.why` in the same invocation (see the feature skill step 6). No manual build — snapshots refresh via the canonical path (see events/README.md).

## Rules

- Never implement inside agenda.
- Deliberations stay in chat; only the `ready` status is recorded.
- Never silently drop a reviewer finding.
- Never silently drop a Debt item.
