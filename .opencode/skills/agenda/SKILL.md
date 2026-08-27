---
name: agenda
description: Select and fix the unit of work before implementation. Use when the user decides to build something (実装しよう / 作ろう), says "agenda", or asks to plan work (作業単位). Identifies the impact scope first, plans a rebuild of the feature including that scope (never an accretion), reviews the plan via the agenda-reviewer subagent, and records stage transitions after explicit agreement.
---

# Agenda

Turn an implementation decision into an agreed plan, then record it. Never implement inside agenda.

## Scope

- Idea capture ("ログインを作りたい") is not agenda — it is plain discussion: once the content is agreed, append it directly (new features enter as `planned`; stack / roadmap changes surfaced by the same discussion go together).
- Pure JSON value changes (copy tweaks, status flips) skip agenda entirely — append directly.
- When unsure whether something counts as implementation, run agenda.
- One agenda = one coherent deliverable; split unrelated areas into separate sessions.

## Responsibilities

|          | Main agent (YOU)                    | agenda-reviewer                                   |
| -------- | ----------------------------------- | ------------------------------------------------- |
| Scope    | Decide the plan, targets, and scope | Receive the plan and the impact scope             |
| Review   | Never (delegate to the sub-agent)   | Check plan and files against the review viewpoint |
| Judgment | Integrate findings, decide adoption | Never                                             |
| Output   | Present the plan and findings       | Return findings in a fixed format                 |

## Procedure

1. **Domain & Definition axes** — decide whether the work targets product or meta, then check the target keys against the definition axes below. Any hit means agenda cannot proceed: register / revise / split via the feature skill, then restart from scratch.
2. **Impact scope** — identify the impact scope FIRST, before any design. Enumerate every file the change touches using the scope conditions in [references/code-axes.md](./references/code-axes.md). The scope is the unit of rebuild: the target feature is rebuilt together with its impact scope, never added onto.
3. **Design** — read the files in the impact scope, check them against the code axes below, and decide the design direction with the four labels below. The agreed refactor enters the plan completely, never partially; if refactor + feature cannot share one session, this agenda carries the full refactor and the feature follows in a later cycle.
4. **Tests** — decide the test policy per order using the test criteria below.
5. **Review & Integrate** — spawn the `agenda-reviewer` subagent with the draft plan and the impact scope. It checks ONLY the impact-scope/rebuild viewpoint (see code-axes.md) and returns findings. Fold the findings into the plan: address each or defer with a reason. Never silently drop a finding.
6. **Present & discuss** — show the plan and the findings to the user, and iterate until explicit agreement.
7. **Record** — on consensus, append the stage transitions. Findings such as a needed stack revision are irregular: stop, handle outside this flow, then restart agenda.

## Judgment axes

All deliberations happen in chat and are **never recorded**; their outcomes materialize as the Files layout and Tests entries of each order.

### Definition axes (step 1)

Checked against snapshots alone. Any hit aborts agenda here — the fix belongs to the feature skill (registration / revision / splitting).

| Axis           | Hit condition                                 |
| -------------- | --------------------------------------------- |
| Existence      | no snapshot entry matches the request         |
| Truth          | definition drifted from reality               |
| Single purpose | explaining the purpose needs "and" / "etc."   |
| Route size     | route exceeds 3 steps                         |
| Session size   | ready → commit cannot fit one working session |

### Impact scope conditions (step 2)

The impact scope is the set of files the change touches. Enumerate it before design using the scope conditions in [references/code-axes.md](./references/code-axes.md) — a file is in scope when it matches any condition there.

Files outside the scope stay untouched.

### Code axes (step 3)

Checked by reading the files in the impact scope. A hit does not abort agenda — it routes to the step 3 design decision, and the agreed refactor is added as orders in this agenda.

The axes are defined in [references/code-axes.md](./references/code-axes.md).

### Design labels (step 3)

```
Responsibilities: the existing responsibility boundaries this change touches
Ideal design:     the desired shape of the impact scope, not pulled by the current code
Gap bridging:     how to rebuild from the current state to the ideal, scope included
Debt:             where debt grows and why it is accepted
```

### Test criteria (step 4)

| Target                                        | Policy                                  |
| --------------------------------------------- | --------------------------------------- |
| UI components / markup                        | No unit tests                           |
| Pure functions (fold, validators, formatters) | Unit tests — happy path AND error paths |
| Boundaries (CLI, shell, I/O)                  | Boundary tests including failure modes  |

Keep to the minimum set that catches regressions. Tests live next to their source as `*.test.ts` and run via `pnpm test:run`.

## Presentation

Each order is fully independent: implementable and verifiable on its own. `Depends on` always references earlier numbers (one-way dependencies). Refactor orders look like ordinary orders; their Surface verifies behavior preservation (existing tests stay green).

Present the plan in the format defined in [references/product.md](./references/product.md) (product) or [references/meta.md](./references/meta.md) (meta) — read only the file for the decided domain.

## Status semantics

- `planned` — recorded intention. Everything captured starts here, even when the user consented at capture time
- `ready` — passed agenda consensus; awaiting implementation
- On consensus: one status assertion per target — `node events/scripts/append.mjs --set <key>.status '{"stage":"ready","text":"<progress>"}'`. Multiple targets can share one invocation (one shared ts)
- No manual build: the idle hook syncs snapshots after the turn ends
