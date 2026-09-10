---
name: concept
description: Agree on the product look direction with generated screen images before building. Use when aligning on appearance (方向性を決めたい / 画面イメージを作って / コンセプトを固めたい), generating UI concept renders to share with the agent, or registering keywords/motion/density to look.
---

# Concept

Decide the product look direction with generated screen images. Discuss qualitatively, render cheap drafts, confirm with the user, review slop upstream, and register the agreement to `look`. Numbers are annotations after generation — never feed raw motion / density values to image prompts.

## Layout

```
.opencode/skills/concept/
  SKILL.md               # This document
  references/
    prompting.md         # UI prompt-expansion methodology (7-axis schema, vocabulary, placeholder rule)
    patterns.md          # Context typical/range as starting proposals (non-binding)
    culture.md           # Show-don't-ask galleries and alignment workflow
  scripts/
    generate.mjs         # Draft text-to-image generation (single / multiple candidates)
    edit.mjs             # img2img editing: regenerate (cheap) or finish (higher-tier)
    lib/
      params.mjs         # Model-specific parameter dispatch (pure functions)
      api.mjs            # OpenRouter client (shared I/O layer)
      cli.mjs            # Shared CLI helpers
      *.test.mjs         # Adapted boundary/unit tests
```

Self-contained by design: the engine is duplicated from imagegen and adapted (output roots `concept/` + `concept/tmp/`). Never reference other skills' directories.

## Prerequisites

- **API key**: `OPENROUTER_API_KEY` in the environment (same as imagegen; this skill only reads it)
- **Runtime**: Node.js 22+ (global `fetch`). No additional dependencies

## Output conventions

Generated images live under the **calling project's root** (never inside the skill directory).

```
<project root>/
  concept/           # Agreed direction renders (tracked, committable)
    tmp/             # Drafts and intermediates (git-ignored via concept/tmp/)
```

## Procedure (decision tree)

1. **Dialogue** — align qualitatively before rendering. Show two reference directions from `references/culture.md` and ask which feels closer (show, don't ask). Settle: screen type, audience, mood. Propose starting motion / density from `references/patterns.md` as proposals only — decided after the renders, never asked as numbers
2. **Brief** — output one line: `"Reading this as: <screen type> for <audience>, <mood direction>."` Confirm and adjust
3. **Prompt expansion** — build the prompt per `references/prompting.md` (UI 7-axis schema, qualitative vocabulary, placeholder copy only)
4. **Generate (draft)**:
   ```
   node scripts/generate.mjs --prompt "<detailed prompt>" [--n <1-10>] [--aspect-ratio <16:9|9:16>]
   ```
   - Drafts land in `concept/tmp/`. Use `--n` for candidates. Aspect hints: `16:9` desktop, `9:16` mobile-ish
   - **Completion A**: draft suffices for direction agreement — stop here
5. **Slop review (1st)** — run `slop-reviewer` over the drafts. Fix direction-level tells by regenerating; record what was rejected and why in chat
6. **User confirmation (required)** — show drafts and confirm: **keep / regenerate / finish**
7. **Regenerate (cheap)** — `node scripts/edit.mjs --input "<draft>" --style draft --prompt "<change + KEEP>"`. **Completion B** when satisfactory
8. **Finish (optional)** — only for renders shown outside the team: `node scripts/edit.mjs --input "<draft>" --style illustration --prompt "<finish>"` (illustration-leaning; photo only for photorealistic key visuals). Artifact lands in `concept/`. **Completion C**
9. **Slop review (2nd)** — run `slop-reviewer` over the agreed render before freezing the brief
10. **Register** — look at the agreed render and decide keywords + motion / density, then append (numbers quantified only here):
    ```bash
    node events/scripts/append-build.mjs --set product.look.keywords '["<k1>","<k2>"]' \
      --set product.look.motion '{"value":<1-5>,"label":"<Name>"}' \
      --set product.look.density '{"value":<1-5>,"label":"<Name>"}' \
      --set product.look.concepts.<id> '{"path":"concept/<file>","description":"<one-liner>"}'
    ```
11. **Hand off** — concept → mockup passes the render + look values; concept → product skips mockup and implements from them directly

## Rules

- One concept round = one direction. Multiple directions become separate `<id>` registrations
- Copy in renders is always placeholder; exact wording lives in the brief text
- Slop checks live in `slop-reviewer` — this file holds 3-line references only, details in the agent body
- Costs print per generation; keep drafts cheap, finish rarely
