---
name: agenda
description: Select and fix the unit of work before implementation. Use when the user decides to build something (実装しよう / 作ろう), says "agenda", or asks to plan work (作業単位). Picks targets from existing snapshots, settles test policy and file structure, and records stage transitions after explicit agreement.
---

# Agenda

Turn an implementation decision into an agreed plan, then record it. Never implement inside agenda.

## Scope

- Idea capture ("ログインを作りたい") is not agenda — it is plain discussion: once the content is agreed, append it directly (new features enter as `planned`; stack / roadmap changes surfaced by the same discussion go together).
- Pure JSON value changes (copy tweaks, status flips) skip agenda entirely — append directly.
- When unsure whether something counts as implementation, run agenda.
- One agenda = one coherent deliverable; split unrelated areas into separate sessions.

## Procedure

1. **Domain** — decide whether the work targets product or meta.
2. **Definition axes** — derive target keys (`product.features.<id>` / `meta.<section>.<id>`) from the request and check them against the definition axes below (snapshots alone are enough). Any hit means agenda cannot proceed: register / revise / split via the feature skill, then restart from scratch.
3. **Code axes** — read the files the plan would modify and check them against the code axes below. A hit is discussed with the user before any order is designed, using these four labels:

   ```
   Responsibilities: この変更が触る既存の責務境界
   Ideal design:     現行コードに引っ張られない望ましい形
   Gap bridging:     現状から理想へどう着地するか
   Debt:             増えるならどこで、なぜ許容するか
   ```

   The agreed refactor enters the plan completely, never partially; if refactor + feature cannot share one session, this agenda carries the full refactor and the feature follows in a later cycle.

4. **Tests** — decide per order using the test criteria below.
5. **Present & discuss** — show the full plan in the presentation format below and iterate until explicit agreement.

6. **Record** — on consensus, append events. The normal flow causes **stage transitions only** (`→ ready`), each recorded as one whole-status assertion per target (e.g. `{"stage":"ready","text":"実装計画が確定。実装待ち"}`). Findings such as a needed stack revision are irregular: stop, handle outside this flow, then restart agenda.

## Judgment axes

All deliberations happen in chat and are **never recorded**; their outcomes materialize as the Files layout and Tests entries of each order.

### Test criteria

| Target                                        | Policy                                  |
| --------------------------------------------- | --------------------------------------- |
| UI components / markup                        | No unit tests                           |
| Pure functions (fold, validators, formatters) | Unit tests — happy path AND error paths |
| Boundaries (CLI, shell, I/O)                  | Boundary tests including failure modes  |

Keep to the minimum set that catches regressions. Tests live next to their source as `*.test.ts` and run via `pnpm test:run`.

### Definition axes

Checked against snapshots alone. Any hit aborts agenda here — the fix belongs to the feature skill (registration / revision / splitting).

| Axis           | Hit condition                                 |
| -------------- | --------------------------------------------- |
| Existence      | no snapshot entry matches the request         |
| Truth          | definition drifted from reality               |
| Single purpose | explaining the purpose needs "and" / "etc."   |
| Route size     | route exceeds 3 steps                         |
| Session size   | ready → commit cannot fit one working session |

### Code axes

Checked by reading the files to modify. A hit adds refactor orders to this agenda — it never aborts it.

| Axis                 | Rule                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| Replace over accrete | never patch dirty spots; refactor first, then add                                      |
| Root cause           | fix the cause, not the symptom                                                         |
| Pattern spread       | same problem elsewhere? include sibling fixes in scope, or state why not               |
| Size limits          | functions ≤ 80 lines, files ≤ 480 lines; oversized existing files get a split proposal |
| Pure vs boundary     | logic and I/O live in separate layers — this drives the test policy                    |
| Shared extraction    | logic used by multiple slices goes into a shared module                                |

Refactoring never creates new entries — it rides on the cycles of the existing units whose code it touches.

## Presentation

Each order is fully independent: implementable and verifiable on its own. `Depends on` always references earlier numbers (one-way dependencies). Refactor orders look like ordinary orders; their Surface verifies behavior preservation (existing tests stay green).

Present the plan in the format defined in [references/product.md](./references/product.md) (product) or [references/meta.md](./references/meta.md) (meta) — read only the file for the decided domain.

## Status semantics

- `planned` — recorded intention. Everything captured starts here, even when the user consented at capture time
- `ready` — passed agenda consensus; awaiting implementation
- On consensus: one status assertion per target — `node events/scripts/append.mjs --set <key>.status '{"stage":"ready","text":"<progress>"}'`. Multiple targets can share one invocation (one shared ts)
- No manual build: the idle hook syncs snapshots after the turn ends
