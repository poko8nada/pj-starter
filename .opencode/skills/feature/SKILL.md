---
name: feature
description: Register, split, or revise features (product.features) and meta components. Use when adding something new (〜を作りたい / 追加して / 登録), splitting oversized ones (分割), or revising definitions. Ensures complete trigger/result/route definitions and session-sized granularity.
---

# Feature

Own the lifecycle data of slices: registration, splitting, and definition revisions — for both product and meta. Selection for implementation belongs to agenda; implementation itself is out of scope.

## References

Definitions (what a slice is) live in the schema; procedures (how to derive one) live here:

- Definitions: `events/spec/schema.md` (vertical slice, 3 fields, 3-step constraint, completeness test)
- Procedures: `references/extraction.md`, `references/completeness.md`, `references/splitting.md`
- Current state: `events/snapshots/product.json`, `events/snapshots/meta.json`
- Log rules: `events/README.md`

Read the procedure file when its condition holds — never skip:

- Screens exist (`look.mockups`, `look.concepts`, image, existing HTML) → must read `references/extraction.md`
- `route` may exceed 3 steps, session sizing is doubtful, or `route` risks becoming a visual enumeration → must read `references/splitting.md`
- Every candidate must pass `references/completeness.md` before sizing — read it on all registrations

## Registration

When a discussion settles on something new:

1. **Domain** — product feature or meta component.
2. **Derive candidates** — follow `references/extraction.md` for the matching source (from scratch / screen-driven / code-driven). Never register screen elements verbatim.
3. **Draft the full definition** — nothing partial enters the log:
   - Product: `{trigger, result, route}` with **at most 3 route steps** — write `trigger` and `result` in Japanese (route step IDs stay English)
   - Meta: `{purpose}` (+ `path` once it exists)
4. **Complement check** — apply `references/completeness.md` to every candidate; add the missing behind-slices before sizing.
5. **Size check** — one working session must carry it `ready → commit` (schema session rule). If obviously larger, split per `references/splitting.md` instead of registering oversized.
6. **Append** — one invocation carries both sets: `set <key> '<full definition>'` and `set <key>.status '{"stage":"planned","text":"未着手"}'`. The explicit assertion is the canonical route in both namespaces; rebuild's injection is only a product-side backstop.
7. **Co-append related facts** — when the slice implies fact updates (`roadmap` membership, `stack` entries), append them in the same invocation; when none apply, say `none` in chat.
8. **Co-append the reason on important decisions** — new work units and `stack` / `roadmap` / `look` changes ship with `set <key>.why '<reason>'` (plus optional `set <key>.whyNot '<discarded>'` in the same invocation); the append assigns the timestamped entry key. Trivial edits need no reason.

## Splitting

If an existing component turns out oversized (route > 3 steps, mixed purposes, a session cannot carry it):

1. Split per `references/splitting.md` (product: operation boundaries; meta: purpose boundaries)
2. Same depth, kebab-composed ids per the schema shape rule — never deeper nesting
3. Record: `del` the original key, then `set` each sibling with its sub-definition plus an explicit `planned` status

## Definition revisions

Route or definition changes on existing components are deep-key sets with full-value assertions. Keep stages truthful: when new work on a committed component is agreed, assert the whole status in one event — `set <key>.status '{"stage":"ready","text":"<progress>"}'`. Stage and progress note always travel together.

## Rules

- The log only accepts finished definitions — never leave a draft incomplete
- One registration = one coherent deliverable
- Never register visual composition as a route — the schema circuit rule decides (every step must serve trigger → result)
- No manual build: snapshots refresh via the canonical path (see events/README.md)
