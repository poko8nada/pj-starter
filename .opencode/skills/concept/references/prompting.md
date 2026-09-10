# Prompting

Prompt expansion policy for concept screen generation. After the dialogue phase in SKILL.md settles the qualitative direction, assemble the final prompt following the methodology below.

## Basic policy

- **Numbers never enter the prompt** — motion / density values stay as registration annotations. Translate them into qualitative words first (see Vocabulary).
- **Concrete directions are normalized only** — do not add extra subjects, brands, or narrative.
- **Abstract directions get tasteful augmentation only** — add layout, whitespace, or use-case hints; never invent subjects or brands.
- Copy in images is always placeholder. Exact wording lives in the brief text, never in the render.

## Structured schema

Assemble detailed prompts using the labels below; use only the fields you need.

- **Screen** — screen type (landing top, dashboard, settings, product list, etc.)
- **Viewport** — viewport and device frame (mobile 390px, desktop 1440px, full-bleed, framed, etc.)
- **Layout** — layout (single column, sidebar + main, card grid N columns, etc.)
- **Hierarchy** — information hierarchy (what dominates, what recedes, CTA placement)
- **Mood** — mood and atmosphere (calm, technical, warm, premium, etc.)
- **Palette** — color direction (use `#RRGGBB` when specific)
- **Copy** — placeholder copy only (lorem-style or abstract markers, never final wording)
- **Constraints/Avoid** — elements to avoid

## Vocabulary (qualitative translations)

Use these words in prompts instead of numeric values:

- Sparse / Airy → `spacious`, `single message per screen`, `generous whitespace`
- Standard → `balanced`, `card-based`
- Compact / Dense → `information-rich`, `tight spacing`, `data-forward`

## Style routing

- `draft` (default) — cheap text-to-image drafts for direction confirmation. Sufficient when the direction is the goal
- `finish` (optional) — higher-tier img2img when the draft must be shown outside the team. Illustration-leaning route; photo route only for photorealistic key visuals

## In-image text

- Never render final copy. Mark text regions as abstract blocks or lorem-style placeholders
- If a sign-like element is unavoidable, wrap it in `"quoted text"` with typeface, placement, and color — and flag it as provisional
- Long or Japanese text is error-prone. Text fidelity is explicitly out of scope for concept renders

## Iterative editing

- For tweaks, pass the previous output as `--input` and repeat edit
- Each iteration must state **what to change** and **what to keep (KEEP)** to prevent drift
  - Example: `change only the hero to a two-column split; keep the palette and density unchanged`
- Prefer cheap draft regeneration for direction changes; reserve finish for the final artifact
