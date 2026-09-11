# Splitting

When to split and along which lines. The shape constraints (at most 3 route steps, same depth, kebab-composed ids, oversized key removed with `del`) are defined in `events/spec/schema.md`; the `del`-then-`set` siblings with `planned` record step is defined in SKILL.md Splitting. This file holds only the pattern catalog and the anti-patterns.

## Split patterns

- **Oversize route** — a chain longer than 3 steps splits at step boundaries into sequential siblings, each closing its own circuit (e.g. `contact-form-submit` + `contact-form-notify`)
- **Operation unit** — one screen yielding N operations becomes N slices (open / submit / navigate are never one slice)
- **Read vs operate** — passive display (arrival trigger) separates from active mutation (operation trigger)
- **Happy vs error** — the error path (`validation` → `error_display`) separates from the happy path once either side needs its own session
- **Manage vs use** — administration of a thing (create / configure) separates from end use of it
- **Stateful pair** — two triggers separated in time by persisted state (login/logout, `on`/`emit`) split into a state-creating slice and a state-consuming slice; never force both into one slice
- **Small function lists** — for libraries each function completing call → result on its own is vertical, not fragmentation; many small slices are correct

## Anti-patterns (never register)

- **1 screen = 1 feature** — a screen is inventory (`extraction.md` Flow B), not a slice
- **Visual enumeration** — `route: [hero_copy, hero_visual, cta_button]` lists what is rendered together but serves no trigger → result circuit; re-derive as a processing chain
- **Happy-only** — user-facing sets without answered validation / empty rows from `completeness.md`
- **Horizontal grouping** — `all UI components` or `all DB access` has no closed circuit; reject regardless of size

## Recording reminder

Recording follows SKILL.md Splitting (`del` the oversized key, then `set` each sibling with its sub-definition plus an explicit `planned` status).
