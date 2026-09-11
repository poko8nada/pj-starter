# Extraction

How to derive slice candidates without ad-hoc gaps. Pick one source flow below. Definitions (slice, fields, completeness test) live in `events/spec/schema.md`; this file holds only procedures.

## Flow A — from scratch (no screens, no code)

1. Enumerate triggers first — active operations, passive arrivals, programmatic invocations (see schema field definitions). One trigger per line, no results yet
2. Pair each trigger with exactly one observable result (`X happens → Y results`, one sentence)
3. Sketch the route as a processing chain of at most 3 steps (input → check → effect → display). More than 3 means the candidate is two slices — split now per `splitting.md`
4. Run every candidate through the schema completeness test, then through `completeness.md`

## Flow B — screen-driven (mockup / concept / image / existing HTML)

Screens are appearance placeholders, not slices (the verbatim ban sits in SKILL.md Registration).

1. List screen elements (sections, forms, buttons, links) with their IDs — this list is inventory, not features
2. Operation-ize each element: convert `X is displayed` into the cause that produces it:
   - Bad (verbatim): trigger `なし` / result `価値提案とCTAボタンが表示される` / route `[hero_copy, hero_visual, cta_button]`
   - Good (operation): trigger `訪問者がトップページを開く` / result `価値提案とCTAボタンが表示される` / route `[page_request, hero_assemble]`
   - Rule: a display-only result is allowed only with an arrival trigger (page open, scroll to section). A button without its submit/navigation/persistence behind is inventory, not a slice
3. For every operation-ized candidate, ask what the screen hides: submit destination, validation, error display, auth gate, transition target. Add those as candidates now — the screen never shows them
4. Apply `completeness.md`, then the completeness test

## Flow C — code-driven (existing implementation)

1. Trace what the code currently does as trigger → result paths (reuse the agenda Report Behavior line when one exists)
2. Each independently closable path is one candidate; shared helpers and middleware are not candidates (they serve circuits, they are not circuits)
3. Where the code is display-only scaffolding (static markup without handler, `href`, submit, or state change), mark it as inventory and add the missing behind-slice as a candidate instead of registering the scaffolding
4. Apply `completeness.md`, then the completeness test

## Exit criteria

- Every candidate closes its own circuit without referencing another unfinished piece
- No candidate is a visual enumeration (see `splitting.md` anti-patterns)
- Every candidate passed `completeness.md`
