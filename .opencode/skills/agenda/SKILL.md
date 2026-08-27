---
name: agenda
description: Select and fix the unit of work before implementation. Use when the user decides to build something (実装しよう / 作ろう), says "agenda", or asks to plan work (作業単位). Picks targets from existing snapshots, settles test policy and file structure, reviews the plan via the agenda-reviewer subagent, and records stage transitions after explicit agreement.
---

# Agenda

Turn an implementation decision into an agreed plan, then record it. Never implement inside agenda.

## Scope

- Idea capture ("ログインを作りたい") is not agenda — it is plain discussion: once the content is agreed, append it directly (new features enter as `planned`; stack / roadmap changes surfaced by the same discussion go together).
- Pure JSON value changes (copy tweaks, status flips) skip agenda entirely — append directly.
- When unsure whether something counts as implementation, run agenda.
- One agenda = one coherent deliverable; split unrelated areas into separate sessions.

## Responsibilities

|          | Main agent (YOU)                    | agenda-reviewer                        |
| -------- | ----------------------------------- | -------------------------------------- |
| Scope    | Decide the plan, targets, and scope | Receive the plan and file paths        |
| Review   | Never (delegate to the sub-agent)   | Check plan and files against code axes |
| Judgment | Integrate findings, decide adoption | Never                                  |
| Output   | Present the plan and findings       | Return findings in a fixed format      |

## Procedure

1. **Domain & Definition axes** — decide whether the work targets product or meta, then check the target keys against the definition axes below. Any hit means agenda cannot proceed: register / revise / split via the feature skill, then restart from scratch.
2. **Design** — read the files the plan would modify, check them against the code axes below, and decide the design direction with the four labels below. The agreed refactor enters the plan completely, never partially; if refactor + feature cannot share one session, this agenda carries the full refactor and the feature follows in a later cycle.
3. **Tests** — decide the test policy per order using the test criteria below.
4. **Review & Integrate** — spawn the `agenda-reviewer` subagent with the draft plan and the file paths it touches plus adjacent neighbors (files that share the same module, import the same dependencies, or sit in the same directory). It checks the plan and files against the code axes and returns findings. Fold the findings into the plan: address each or defer with a reason. Never silently drop a finding.
5. **Present & discuss** — show the plan and the findings to the user, and iterate until explicit agreement.
6. **Record** — on consensus, append the stage transitions. Findings such as a needed stack revision are irregular: stop, handle outside this flow, then restart agenda.

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

### Code axes (step 2)

Checked by reading the files to modify. A hit does not abort agenda — it routes to the step 2 design decision, and the agreed refactor is added as orders in this agenda.

The six axes are defined in [references/code-axes.md](./references/code-axes.md).

### Design labels (step 2)

```
Responsibilities: the existing responsibility boundaries this change touches
Ideal design:     the desired shape, not pulled by the current code
Gap bridging:     how to land from the current state to the ideal
Debt:             where debt grows and why it is accepted
```

### Test criteria (step 3)

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
