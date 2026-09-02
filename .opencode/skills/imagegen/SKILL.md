---
name: imagegen
description: Generate images via the OpenRouter image API for both illustration and photo styles. Use when the user asks to generate an image (画像生成して / イラスト作って / 写真風に / ロゴ作って). Drafts use muse-image (can also be the final output); refine with Nano Banana 2 Lite (photo) or Seedream 5.0 Lite (illustration/text) when needed. Requires OPENROUTER_API_KEY in the environment.
---

# Imagegen

Generate images through the OpenRouter image API, supporting both illustration and photo styles. Drafts are produced with the cheap muse-image model; only when quality, resolution, or in-image text is needed do we refine with a higher-tier model. Single-shot requests finish with muse alone.

## Layout

```
.opencode/skills/imagegen/
  SKILL.md               # This document
  references/
    prompting.md         # Prompt expansion methodology, structured schema, model-specific guide
  scripts/
    generate.mjs         # muse-image draft generation (single / multiple candidates)
    refine.mjs           # img2img finish with a higher-tier model (style-based model routing)
    lib/
      params.mjs         # Model-specific parameter dispatch (pure functions)
      api.mjs            # OpenRouter client (shared I/O layer)
      cli.mjs            # Shared CLI helpers for generate/refine (arg validation, filename slug)
```

## Prerequisites

- **API key**: environment variable `OPENROUTER_API_KEY` is required. The skill only reads it from the environment; it does not acquire it (in this project the root `.envrc` loads it from Keychain). Ensure `direnv allow` has been run.
- **Runtime**: Node.js 22+ (global `fetch`). No additional dependencies.

## Output conventions

Generated images are saved under the **calling project's root** (never inside the skill directory).

```
<project root>/
  imagegen/        # Final artifacts (tracked, committable)
    tmp/           # Drafts and intermediates (git-ignored)
```

- Rationale: generated images are artifacts of the requesting project, not distributable skill content, so they are not kept inside the skill (unlike mockup's self-contained workbench). `tmp/` holds bulk drafts and is excluded from tracking (`.gitignore` must contain `imagegen/tmp/`).

## Procedure

1. **Dialogue phase** — only when the request is ambiguous, ask 2-3 questions (keep it minimal to avoid noise):
   - Style: illustration or photo (`photo` / `illustration`)
   - Purpose, subject, and composition hints
   - If the request is already detailed, go straight to generation (do not over-ask)
2. **Prompt expansion** — build the final prompt following the structured schema in [references/prompting.md](./references/prompting.md). Normalize concrete prompts; apply tasteful augmentation only to abstract ones.
3. **Generate (draft)**:
   ```
   node scripts/generate.mjs --prompt "<detailed prompt>" [--n <1-10>] [--aspect-ratio <1:1>]
   ```
   - muse-image saves drafts to `imagegen/tmp/`.
   - Use `--n` to produce multiple candidates and let the user pick.
4. **Decide** — if the draft is sufficient, stop here. If quality, resolution, in-image text, or consistency is needed, go to finish.
5. **Finish (img2img)**:
   ```
   node scripts/refine.mjs --input "<draft path>" --style <photo|illustration> --prompt "<finish instruction>"
   ```
   - `--style photo` → Nano Banana 2 Lite; `--style illustration` → Seedream 5.0 Lite.
   - `--model` takes precedence over `--style` when both are given.
   - The artifact is saved to `imagegen/`.
   - For further tweaks, pass the previous output as `--input` and iterate (see prompting.md).

## CLI flags

**generate.mjs** (muse-image draft):

| Flag              | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `--prompt`        | Detailed prompt (required)                              |
| `--n`             | Number of images 1-10 (muse)                            |
| `--aspect-ratio`  | e.g. `1:1` `16:9`                                       |
| `--quality`       | `auto`/`low`/`medium`/`high`                            |
| `--output-format` | `png`/`jpeg`/`webp`                                     |
| `--final`         | Save to `imagegen/` when set, `imagegen/tmp/` otherwise |
| `--out`           | Explicit output directory                               |

**refine.mjs** (higher-tier finish):

| Flag              | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `--input`         | Source image path (local file or http URL)                              |
| `--prompt`        | Finish instruction (required)                                           |
| `--style`         | `photo` / `illustration` (only when `--model` is not given)             |
| `--model`         | Finish model directly (takes precedence over `--style`)                 |
| `--n`             | Number of images (model-dependent cap)                                  |
| `--resolution`    | Model-supported value (Seedream: `2K`/`4K`, Nano Banana: `1K`)          |
| `--aspect-ratio`  | e.g. `1:1` `16:9`                                                       |
| `--output-format` | Model-supported value (Seedream: `png`/`jpeg`, Nano Banana: `png` only) |
| `--out`           | Explicit output directory (default `imagegen/`)                         |

## Model selection (summary)

| Use case                       | Model                                             | Script                            |
| ------------------------------ | ------------------------------------------------- | --------------------------------- |
| Draft / single-shot / ideation | `meta/muse-image` ($0.01/image, n=1-10)           | generate.mjs                      |
| Photo finish                   | `google/gemini-3.1-flash-lite-image` (1K, n=1)    | refine.mjs `--style photo`        |
| Illustration / text finish     | `bytedance-seed/seedream-5.0-lite` (2K/4K, n=1-4) | refine.mjs `--style illustration` |

## Cost and notes

- Each script prints the generation cost from `usage.cost`. Keep drafts cheap on muse and reserve higher-tier models for the finish.
- Models differ in supported parameters (resolution, count). Invalid values (`n`/`resolution`/`output_format`/`quality`/`aspect_ratio`) are rejected by params.mjs before the call to prevent 400s; API errors are handled by api.mjs.
- In-image text is error-prone. If text is the primary goal, avoid image generation (see prompting.md).
