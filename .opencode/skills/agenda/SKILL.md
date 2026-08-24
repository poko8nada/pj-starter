---
name: agenda
description: Select and fix the unit of work before implementation. Use when the user decides to build something (実装しよう / 作ろう), says "agenda", or asks to plan work (作業単位). Picks targets from existing snapshots, settles test policy and file structure, and records status transitions after explicit agreement.
---

# Agenda

Turn an implementation decision into an agreed plan, then record it. Never implement inside agenda.

## Scope

- Idea capture ("ログインを作りたい") is not agenda — it is plain discussion: once the content is agreed, append it directly (new features enter as `planned`; stack / roadmap changes surfaced by the same discussion go together).
- Pure JSON value changes (copy tweaks, status flips) skip agenda entirely — append directly.
- When unsure whether something counts as implementation, run agenda.
- One agenda = one coherent deliverable; split unrelated areas into separate sessions.

## Existing only

Agenda never creates or defines new components. It works exclusively with the current snapshot state.

If a required component is missing from the snapshot, **stop agenda immediately**, capture it through discussion (append as `planned`), then **restart agenda from scratch**. Never resume mid-way.

## Procedure

1. **Domain** — decide whether the work targets product or meta.
2. **Slices & structure** — select targets from the existing snapshot state and design implementation slices with refactoring-aware layering, following the structure axes below.
3. **Tests** — decide per order using the test criteria below.
4. **Present** — show the plan in the presentation format below.
5. **Discuss** — revise until the user explicitly agrees.
6. **Record** — on consensus, append events. The normal flow causes **status transitions only** (`→ ready`). Findings such as a needed stack revision are irregular: stop, handle outside this flow, then restart agenda.

## Judgment axes

Both deliberations happen in chat and are **never recorded**; their outcomes materialize as the Files layout and Tests entries of each order.

### Test criteria

| Target                                        | Policy                                  |
| --------------------------------------------- | --------------------------------------- |
| UI components / markup                        | No unit tests                           |
| Pure functions (fold, validators, formatters) | Unit tests — happy path AND error paths |
| Boundaries (CLI, shell, I/O)                  | Boundary tests including failure modes  |

Keep to the minimum set that catches regressions. Tests live next to their source as `*.test.ts` and run via `pnpm test:run`.

### Structure axes

| Axis                       | Rule                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| Pure vs boundary           | Logic and I/O live in separate layers — this drives the test policy                              |
| Shared extraction          | Logic used by multiple slices is extracted into a shared module                                  |
| Size limits                | Functions ≤ 80 lines, files ≤ 480 lines (same values as oxlint) — stay under them from the start |
| Existing file modification | If the target file already exceeds limits or mixes responsibilities, include a split proposal    |

## Presentation formats

Each order is fully independent: implementable and verifiable on its own. `Depends on` always references earlier numbers (one-way dependencies).

### Product

```
Agenda: login feature
Domain: product

Feature (from snapshots/product.json):
  Trigger: ユーザーが認証情報を送信する
  Result:  セッションが確立する
  Route:   [credential_check, session_create, login_endpoint]

Order:
  1. Session management
     Route step: session_create
     Target: product.features.auth
     Depends on: none
     Files:
       - src/lib/auth/session.ts (create)
         - createSession()
         - validateToken()
     Tests:
       - src/lib/auth/session.test.ts — unit: happy path + invalid token errors
     Surface:
       - pnpm test:run passes

  2. Login endpoint
     Route step: credential_check + login_endpoint
     Target: product.features.auth
     Depends on: 1
     Files:
       - src/routes/api.ts (modify)
         - handleLogin()
     Tests:
       - src/routes/api.test.ts — boundary: failure modes included
     Surface:
       - POST /api/login responds; trigger → result confirmed via curl
```

Product rules:

- Feature block is read-only display from the snapshot
- Orders map to the feature's route steps; every route step is covered at least once, and dependency direction matches route order
- The last order's Surface verifies trigger → result end-to-end

### Meta

```
Agenda: audit skill implementation
Domain: meta

Component (from snapshots/meta.json):
  Purpose: 生成物をログで絞り込みレビューする
  Status:  planned

Order:
  1. SKILL.md creation
     Target: meta.skills.audit
     Depends on: none
     Files:
       - .opencode/skills/audit/SKILL.md (create)
         - review procedure and scoping rules
     Tests:
       - none (documentation)
     Surface:
       - skill triggers and presents the review procedure
```

Meta rules:

- The component's `purpose` anchors the decomposition; there is no route mapping
- Test criteria apply unchanged (code → pure/boundary tests; documentation → none)

## Status semantics

- `planned` — recorded intention. Everything captured starts here, even when the user consented at capture time
- `ready` — passed agenda consensus; awaiting implementation
- On consensus: set `<key>.status = "ready"` via deep-key appends for the selected existing targets
- No manual build: the idle hook syncs snapshots after the turn ends
