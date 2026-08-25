---
name: readme
description: Draft or update the root README (README.md English canonical + README.ja.md Japanese mirror) from snapshot facts and codebase evidence. Use when the user asks to write, generate, or update a README (README書いて / 作って / 更新して), or after product state changed materially.
---

# Readme

Own the root README as a generated artifact: draft it from the event snapshots and verify every claim against the codebase. Other documents (AGENTS.md, events/) are out of scope — never rewrite them from here.

## References

- Product facts: `events/snapshots/product.json`
- Log rules: `events/README.md`
- Agent entry point (pointer target, never duplicated): `AGENTS.md`

## Sources of truth

Write only what is verifiable:

1. **Snapshots** — name, what, stack, roadmap, deploy come from `product.json`
2. **Codebase** — install/usage commands must match real scripts (`package.json`), directory layout, and the license file
3. **Nothing else** — never invent features, versions, or badges

Claims you cannot verify become visible TODO markers (`<!-- TODO: … -->`), never silent guesses.

## Structure

Both files share one skeleton, in this order:

1. Language selector — `English | [日本語](./README.ja.md)` (reversed in the JA file)
2. Title + badges — truthful facts only (license, runtime, package manager); shields.io flat style; no CI/coverage badges unless such tooling actually exists
3. One-liner — one sentence from `product.what`
4. Description — what it is and why it exists
5. Install — copy-pasteable commands matching real scripts
6. Usage — minimal runnable example with expected output
7. Roadmap — from `product.roadmap`; omit when empty
8. Contributing — decide per **Section decisions** below
9. License — decide per **Section decisions** below
10. Agent pointer — exactly one line: "See [AGENTS.md](./AGENTS.md) for AI coding instructions." Harness/skill internals are never documented in the README

## Section decisions

Two sections need a fact-based verdict before writing. In both, never fabricate: no invented PR workflows, codes of conduct, CLA requirements, or license choices — picking a license is a human decision.

### License

Check a root `LICENSE*` / `COPYING*` file and the `license` field in `package.json`:

1. File exists → state the SPDX name and link to the file; license badge allowed
2. Field exists but no file → name the declared license, add a TODO marker to create the file; no badge
3. Neither → "No license specified yet" plus a TODO marker; no badge

### Contributing

Look for `CONTRIBUTING.md` at the root, `.github/`, or `docs/`:

1. Found → one-line pointer to it; detail stays in that file
2. Not found, project is private (`"private": true`) or clearly internal → one plain sentence saying so; do not dress it up as a policy
3. Not found, project is public → TODO marker inviting the owner to decide

## Bilingual policy

- `README.md` is the English canonical; `README.ja.md` mirrors it section-for-section
- Translate meaning, not wording — each file must read natively; machine-translation flavor is a defect
- Both files change together in one edit pass

## Update mode

When a README already exists, diff it against current snapshot facts and stale codebase checks; revise only the drifted sections. Full regeneration is reserved for empty or structurally broken files.

## Rules

- README is derived output — never append log events about running this skill
- Keep it an entry point: link out instead of dumping detail
- One generation = both languages updated
