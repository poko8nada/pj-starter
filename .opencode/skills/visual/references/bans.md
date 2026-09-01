# Bans

Patterns that AI agents default to. All are banned unless explicitly justified.

## Visual Tells

- Pure black (`#000`) on pure white (`#fff`) — too harsh, unnatural
- AI-purple gradients (purple-to-blue mesh backgrounds)
- Centered hero over dark mesh gradient
- Three equal feature cards in a row
- Generic glassmorphism (blur + white border, no purpose)
- Infinite-loop micro-animations (rotating, pulsing with no end)
- Oversaturated accent colors (>80% saturation)
- Gradient text on every heading
- Custom cursors
- Neon outer glows (`box-shadow` with bright color spread)

## Typography Tells

- Inter as default display font (allowed for body, discouraged for display)
- Fraunces / Instrument Serif as default serif (banned unless brand is serif)
- Oversized H1 (`text-7xl`+) without hierarchy justification
- Serif injection for emphasis (mixing serif + sans in same family) — use weight or italic of the same family
- Mixed font families on one page (max 2: one display, one body)

## Layout Tells

- Mathematically perfect symmetry everywhere (no variation)
- `border-t` + `border-b` on every row
- Section after section of identical layout (8 sections → at least 4 layout families)
- More than 2 consecutive image+text zigzag splits
- Left big headline + right small paragraph (split-header pattern)
- More than 1 eyebrow (`uppercase tracking-wider`) per 3 sections
- Bento grid with 6+ identical left-image/right-text rows

## Content Tells

- "Jane Doe" / "John Smith" as testimonial names
- "Acme Inc" / "Nexus" as company names
- Fake-precise numbers (`92%`, `4.1×`, `1234567`) without source
- "Elevate your ..." / "Seamless ..." / "Unleash ..." / "Revolutionize ..."
- Marketing speak: "From the field", "Quietly in use at", "We respect the French ones"
- Hero version labels (`V0.6`, `BETA`)
- Section-number eyebrows (`00 / INDEX`, `001·`)
- Middle-dot rationing (`·` max 1 per line)
- Decorative colored dots (● ● ●)
- Photo-credit decoration (`Field study no.12 · Ines Caetano`)
- Version footers (`v1.4.2`)
- Live-stock counters (`412/800`)
- Hero decoration strips (`BRAND. MOTION. SPATIAL.`)
- Locale/weather strips (`Lisbon working with founders`)
- Scroll cues (`Scroll ↓`)
- Scoring progress bars with filled tracks
- Pills overlaid on images

## Resource Tells

- Hand-rolled SVG icons (use a library)
- Div-based fake screenshots (rectangles mimicking product UI)
- Broken Unsplash URLs
- shadcn/ui as default without justification
- Emojis as icons (✅ ⚡ 🔥 📊) — use proper icon library

## Em-dash Ban

**Complete zero tolerance.** `—` and `–` as separators are banned in headlines, eyebrows, pills, body, quotes, attribution, captions, buttons, and alt text.

Allowed: hyphen `-` for compound words and ranges (`2018-2026`, `€40-80k`).

## Motion Tells (when `motion <= 3`)

- Scroll event listeners (`window.addEventListener('scroll')`)
- `window.scrollY` in React state
- `requestAnimationFrame` touching React state
- Layout transitions without visible state change
- Staggered animations without parent/children in same Client Component tree

## Density Tells (when `density <= 2`)

- Text-only sections without visual elements
- Generic card containers where spacing suffices
- Cramped padding
