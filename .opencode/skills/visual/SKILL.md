---
name: visual
description: Apply visual design (static + motion) to the product. Use when implementing look and feel (スタイリング適用 / 見た目を実装 / デザイン反映), adding scroll/interactive motion (スクロールで動かす / インタラクティブ / モーション), or referencing mockup output for implementation. Routes to mockup when look is not yet decided.
---

# Visual

Implement the product's visual design — static styling and motion. When the look is not yet decided, hand off to mockup first.

## Procedure

1. **Orient** — read `product.look` from the snapshot. Determine the path:

   | State                                                                | Action                                                       |
   | -------------------------------------------------------------------- | ------------------------------------------------------------ |
   | `product.look.mockups` has entries                                   | **Mockup path** — reference mockup output for implementation |
   | `product.look` missing or empty, look not decided                    | **Hand off** — route to mockup skill                         |
   | `product.look` exists but no mockups (e.g. theme tokens already set) | **Direct path** — apply visual principles to product         |

   "Look not decided" = no `product.look` section exists, or it exists but contains no theme tokens or mockups.

2. **Mode selection** — determine which references to load:

   | Request contains                                                     | Load                      |
   | -------------------------------------------------------------------- | ------------------------- |
   | Motion keywords (スクロール, 動き, インタラクティブ, アニメーション) | `static.md` + `motion.md` |
   | Static only or unclear                                               | `static.md` (default)     |

3. **Implement** — apply visual principles to product code.
   - Mockup path: verify the mockup artifact exists at `.opencode/skills/mockup/workbench/dist/<id>.html`. Read its inlined CSS (from `theme.css`) and screen structure as the starting point. If the artifact is missing, ask the user to run `pnpm build` in the mockup workbench first.
   - Direct path: start from `static.md` principles and existing product theme tokens.

## References

- `references/static.md` — color, typography, font, icon, Tailwind, layout, component patterns
- `references/motion.md` — scroll triggers, interaction patterns, library selection, performance guardrails

## Rules

- Mockup is upstream: when look is undecided, hand off — do not design and implement in one pass
- Mockup knows nothing about visual; visual knows about mockup (asymmetric)
- One session = one visual concern (static or static+motion), not both unless tightly coupled
