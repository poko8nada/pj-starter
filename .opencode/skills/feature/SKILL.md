---
name: feature
description: Register, split, or revise features (product.features) and meta components. Use when adding something new (〜を作りたい / 追加して / 登録), splitting oversized ones (分割), or revising definitions. Ensures complete trigger/result/route definitions and session-sized granularity.
---

# Feature

Own the lifecycle data of slices: registration, splitting, and definition revisions — for both product and meta. Selection for implementation belongs to agenda; implementation itself is out of scope.

## References

- Domain schemas: `events/spec/schema.md`
- Current state: `events/snapshots/product.json`, `events/snapshots/meta.json`
- Log rules: `events/README.md`

## Registration

When a discussion settles on something new:

1. **Domain** — product feature or meta component.
2. **Draft the full definition** — nothing partial enters the log:
   - Product: `{trigger, result, route}` with **at most 3 route steps** — write `trigger` and `result` in Japanese (route step IDs stay English)
   - Meta: `{purpose}` (+ `path` once it exists)
3. **Size check** — one working session must carry it `ready → commit`. If obviously larger, propose a split instead (see Splitting).
4. **Append** — one invocation carries both sets: `set <key> '<full definition>'` and `set <key>.status '{"stage":"planned","text":"未着手"}'`. The explicit assertion is the canonical route in both namespaces; rebuild's injection is only a product-side backstop.
5. **Co-append related facts** — when the slice implies fact updates (`roadmap` membership, `stack` entries), append them in the same invocation; when none apply, say `none` in chat.
6. **Co-append the reason on important decisions** — new work units and `stack` / `roadmap` / `look` changes ship with `set <key>.why '<reason>'` (plus optional `set <key>.whyNot '<discarded>'` in the same invocation); the append assigns the timestamped entry key. Trivial edits need no reason.

## Splitting

If an existing component turns out oversized (route > 3 steps, mixed purposes, a session cannot carry it):

1. Propose sibling components along route-step boundaries (product) or purpose boundaries (meta)
2. Same depth, kebab-composed ids (`auth-session`, `auth-endpoint`) — never deeper nesting
3. Record: `del` the original key, then `set` each sibling with its sub-definition plus an explicit `planned` status

## Definition revisions

Route or definition changes on existing components are deep-key sets with full-value assertions. Keep stages truthful: when new work on a committed component is agreed, assert the whole status in one event — `set <key>.status '{"stage":"ready","text":"<progress>"}'`. Stage and progress note always travel together.

## Rules

- The log only accepts finished definitions — never leave a draft incomplete
- One registration = one coherent deliverable
- No manual build: snapshots refresh via the canonical path (see events/README.md)
