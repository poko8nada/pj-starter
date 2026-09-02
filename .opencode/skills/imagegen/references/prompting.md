# Prompting

Prompt expansion policy for image generation. After the dialogue phase in SKILL.md extracts the details, assemble the final prompt following the methodology below.

## Basic policy (following the OpenAI imagegen convention)

- **Concrete prompts are normalized only** — do not add extra subjects, brands, or narrative.
- **Abstract prompts get tasteful augmentation only** — add composition, whitespace, or use-case hints; never invent subjects or brands.
- Do not inflate the prompt beyond the user's intent. If details are missing, ask 2-3 questions in the SKILL.md dialogue phase before generating.

## Structured schema

Assemble detailed prompts using the labels below; it stabilizes model fidelity. Use only the fields you need.

- **Scene/backdrop** — scene, background, environment
- **Subject** — subject (who/what, state)
- **Style/medium** — style and medium (watercolor / anime / photoreal / flat illustration, etc.)
- **Composition** — composition (close-up / wide / rule of thirds / centered, etc.)
- **Lighting/mood** — lighting and mood (soft morning light / neon / calm, etc.)
- **Color palette** — color scheme (use `#RRGGBB` when specific)
- **Materials** — materials and texture (film grain / canvas, etc.)
- **Text** — in-image text (see below)
- **Constraints/Avoid** — elements to avoid

## Style routing

In the finish phase, `--style` selects the model.

| style          | model              | strength                                               |
| -------------- | ------------------ | ------------------------------------------------------ |
| `photo`        | Nano Banana 2 Lite | photoreal, fastest and cheapest, character consistency |
| `illustration` | Seedream 5.0 Lite  | illustration/diagrams, in-image text, complex prompts  |

- If the style is ambiguous, confirm with the user (illustration or photo).
- Choose `photo` for photorealism; `illustration` for line art, anime, in-image text, or diagrams.

## In-image text

- Wrap text in `"quoted text"` and state the **typeface, placement, and color** explicitly.
  - Example: `A sign that reads "COFFEE" in bold white sans-serif on the door`
- Long or Japanese text is error-prone. **If text is the primary goal, prefer text/HTML rendering over image generation.**
- Seedream 5.0 Lite (`illustration`) is strongest at in-image text; Nano Banana handles short text too.

## Model-specific notes

- **muse-image (draft)**: OpenRouter does not declare supported parameters for it, so assume unsupported parameters may no-op without breaking — api.mjs handles this. `n=1-10` for multiple candidates. Strong at iterative editing and anchored series.
  - `output_format` is sent only when explicitly given via `--output-format` (no default is sent, since OpenRouter's `supported_parameters` is empty for this model).
  - `quality` accepts `auto`/`low`/`medium`/`high`; invalid values are rejected before the call.
- **Nano Banana 2 Lite (photo finish)**: `1K` fixed, `n=1` only. Produce multiple candidates on the muse side via generate.mjs. Resolution cannot be raised; use Seedream for print quality.
- **Seedream 5.0 Lite (illustration finish)**: `2K`/`4K`, `n=1-4`. Strong at high resolution and in-image text.

## Iterative editing

- For tweaks after finishing, pass the previous output as `--input` and repeat refine.
- Each iteration must state **what to change** and **what to keep (KEEP)** to prevent drift.
  - Example: `change only the lighting to warm sunset; keep the composition and character unchanged`
