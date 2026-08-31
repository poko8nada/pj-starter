---
name: mockup
description: Interactive workbench to decide the product look (styling, atmosphere) before building it. Use when creating a mockup (モックアップ作って / 見た目を決めたい / look を議論したい), iterating on screen appearance with visual feedback, or finalizing Tailwind theme tokens and screen structure.
---

# Mockup

Run a dialogue-driven workbench: serve minimal screens of the envisioned product, let the user annotate them in the browser, apply the instructions, and freeze the result into a self-contained HTML artifact. The deliverable records the product `look` — Tailwind theme tokens plus screen structure — before any product code exists.

## Layout

```
.opencode/skills/mockup/
  SKILL.md              # This document
  scripts/
    reset.mjs           # Restore pristine state (dry-run default, --force executes)
    server.mjs          # Dev server lifecycle: serve / stop (pid-tracked, prints real URL)
  workbench/            # Fully self-contained Vite project (independent workspace)
    package.json        # Boundary marker: own deps, own lockfile (with pnpm-workspace.yaml). Deps: tailwindcss, vite (versions tracked here)
    vite.config.ts      # Tailwind v4 / singlefile build / annotations API / overlay injection
    theme.css           # @theme {} — THE deliverable core (Tailwind settings)
    <id>.html           # One mockup = one screen = one HTML (screens live here)
    overlay/            # Meta layer: hover outline + instruction input (dev only)
    annotations.jsonl   # Instruction log (runtime-generated)
    .dev.pid / .dev.log # Dev server tracking (runtime-generated, git-ignored)
    dist/<id>.html      # Built artifact — referenced by events
```

The workbench is excluded from every root quality gate by design. No tests, no linter — keep it simple. To move the skill elsewhere, copy the folder as-is and run `pnpm install` inside `workbench/`.

## Procedure

0. **Orient** — read `product.look.mockups` from the snapshot and list `workbench/*.html`, then branch (never delete anything without user consent):

   | State                           | Action                                                                                                                                                                        |
   | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | No registrations, no screens    | Fresh start — create `<id>.html` (`pnpm install` inside `workbench/` first if `node_modules` is missing)                                                                      |
   | No registrations, screens exist | Unregistered leftovers — propose `node scripts/reset.mjs --force`; on consent run it, then start fresh                                                                        |
   | Registrations exist             | Ask the user: **a)** create a new mockup (next `<id>.html`), or **b)** revise an existing one — edit its `<id>.html`, rebuild, re-`set` the whole `{path, description}` value |

1. **Serve** — `node scripts/server.mjs serve` starts the dev server and prints the actual URL (`/<id>.html`). Create `<id>.html` first if the target screen does not exist yet. Never start `pnpm dev` directly — unmanaged servers become zombies; always go through the script and use the URL it prints (other projects' servers may occupy common ports)
2. **Annotate** — the user hovers components (`data-mock` attributes show ID + outline) and clicks to write instructions. **送信** records each instruction to `annotations.jsonl` as `{ts, target, text, resolved}` without waking anyone; accumulate as many as needed. The **🔔 通知** button appends a `notify` record that the harness plugin (`meta.harness.mockup-notify`) picks up to wake the agent with all unresolved instructions
3. **Iterate** — read unresolved entries, edit the screen source and/or `theme.css`, then rewrite their records with `resolved: true` (e.g. a small node one-liner over `annotations.jsonl`). HMR reflects changes instantly; confirm visually if asked.
4. **Freeze** — when the look settles: run `pnpm build` inside `workbench/` to produce `dist/<id>.html` (CSS inlined, opens correctly via `file://` while online).
5. **Record** — append the standard contract event:
   node events/scripts/append-build.mjs --set product.look.mockups.<id> \
   '{"path":".opencode/skills/mockup/workbench/dist/<id>.html","description":"<one-liner>"}'
   ```

   ```
6. **Stop** — `node scripts/server.mjs stop` kills the tracked server (process group included). **Mandatory at every session end** — leaked servers keep ports occupied and outlive the conversation

## Setup & reset

- **Install** — dependencies live inside the independent workspace: run `pnpm install` inside `workbench/` whenever `node_modules` is missing (fresh clone, first run, after moving the folder). A root-level `pnpm install` does NOT cover the workbench
- **Pristine reset / moving to another project** — `node scripts/reset.mjs` shows the plan (dry-run); `--force` wipes screens, `dist/`, `annotations.jsonl`, and `node_modules`, then reinstalls. Machinery, `theme.css`, and the lockfile are kept; events registrations are never touched (del stale `product.look.mockups.<id>` entries in the source project yourself)
- **Redo one mockup** — delete `workbench/<id>.html` and `dist/<id>.html`, then append `del product.look.mockups.<id>`
- **Clear instructions** — empty `annotations.jsonl` (recreated on the next POST)

## Rules

- One mockup = one screen = one HTML. Multiple screens become sibling `<id>.html` files, each registered under its own `product.look.mockups.<id>`. Ids are kebab-case (`lp-a`, `top-page`) — file name = registration key; new screens are picked up live (dev URL `/<id>.html`) without restarting the server
- Component IDs use `lowercase_snake` (`hero_section`, `cta_button`) on `data-mock` attributes — same convention as feature route steps
- All look decisions concentrate in `theme.css` `@theme {}`; avoid scattered magic values in screens
- Fonts and icons come from CDN (Google Fonts `<link>`, Iconify `<script>` + `<iconify-icon>`); register font families in `@theme`
- The overlay and annotations API exist only in dev (`apply: 'serve'`) — never let them leak into `dist/`
- Screens are placeholders for discussing appearance, not production markup; real implementation reads `theme.css` and the built structure as reference
