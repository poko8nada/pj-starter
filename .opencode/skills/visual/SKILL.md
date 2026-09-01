---
name: visual
description: Apply visual design to the product. Tunable motion (1-5) and density (1-5) dials. Brief inference, anti-slop bans, pre-flight check. Use when implementing look and feel (スタイリング適用 / 見た目を実装 / デザイン反映), adding motion (スクロールで動かす / インタラクティブ / モーション), or building any UI (dashboards, landings, portfolios, admin). Routes to mockup when look is not yet decided.
---

# Visual

Implement the product's visual design. Discuss with the user to align on aesthetic direction, then apply tunable motion and density dials. Avoid anti-slop patterns. Run pre-flight before shipping. When the look is not yet decided, hand off to mockup first.

## Procedure

0. **Align** — discuss the visual direction with the user. This is a conversation, not a form.
   - Read the brief and context. If ambiguous, ask one question. Never guess.
   - Show 2 reference directions from `references/culture.md` (e.g. "Information density = trust" vs "Whitespace = sophistication"). Ask which feels closer. Let the user point at examples.
   - Discuss: what feeling should the user get? What competitors or references does the user like? What should be avoided?
   - Propose `motion` and `density` values based on the discussion. Explain why. Let the user adjust.
   - Do not proceed until the user agrees with the direction.

1. **Brief** — output a one-line read based on the alignment:
   - `"Reading this as: <page type> for <audience>, <aesthetic direction>, motion=<n>, density=<n>."`
   - Confirm with the user. Adjust if needed.

2. **Dial** — set `motion` and `density` values (1-5) based on the brief:
   - `motion`: animation intensity (1=static, 5=cinematic)
   - `density`: information density (1=sparse, 5=dense)
   - Default to 3 if unclear. Override per user request.

3. **Orient** — read `product.look` from the snapshot. Determine the path:
   - `product.look.mockups` is a non-empty object → **Mockup path** — reference mockup output for implementation
   - `product.look` missing, empty `{}`, or mockups is empty → **Hand off** — route to mockup skill
   - `product.look` exists with theme tokens but no mockups → **Direct path** — apply visual principles to product

4. **Implement** — apply visual principles to product code.
   - Load `motion.md` and `density.md` for dial-driven decisions.
   - Load `bans.md` and avoid every listed pattern (conditional bans apply: Motion Tells fire when `motion <= 3`, Density Tells fire when `density <= 2`).
   - Load `patterns.md` for context-specific dial defaults and pattern choices.
   - Mockup path: if multiple mockups exist, ask which to use. Verify the artifact exists at `.opencode/skills/mockup/workbench/dist/<id>.html`. Read its inlined CSS (from `theme.css`) and screen structure as the starting point. If the artifact is missing or CSS is not inlined, ask the user to run `pnpm build` in the mockup workbench first.
   - Direct path: start from principles and existing product theme tokens.

5. **Pre-flight** — before declaring done, run the pre-flight check (see below). Every item must pass.

## References

- `references/motion.md` — animation intensity dial, library selection, performance guardrails
- `references/density.md` — information density dial, spacing, component behavior
- `references/bans.md` — anti-slop patterns to avoid
- `references/patterns.md` — dial values and pattern choices for common contexts
- `references/culture.md` — visual reference sites for aesthetic alignment

## Rules

- Mockup is upstream: when look is undecided, hand off — do not design and implement in one pass
- Mockup knows nothing about visual; visual knows about mockup (asymmetric)
- One session = one visual concern, unless tightly coupled
- Scope is unbounded: dashboards, landings, portfolios, admin panels, marketing pages — all apply

## Pre-flight

Before shipping, verify every item. Single failure = not done.

- [ ] Brief inference declared as one-liner
- [ ] `motion` and `density` values explicit
- [ ] No banned patterns from `bans.md` present (including conditional Motion/Density Tells)
- [ ] `prefers-reduced-motion` handled (if `motion >= 4`)
- [ ] Color contrast meets WCAG AA (4.5:1 text, 3:1 UI)
- [ ] Interactive states present: hover, active, focus, disabled
- [ ] Responsive: no horizontal overflow at 320px, 768px, 1024px, 1440px
- [ ] Loading, empty, and error states defined
- [ ] Real images or explicit `<!-- TBD -->` placeholders (no div fake screenshots)
- [ ] No em-dashes (`—`, `–`) anywhere (complete ban per `bans.md`)
