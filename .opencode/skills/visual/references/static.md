# Static Visual Principles

Selection principles and implementation patterns for static visual elements.

## Color

- Avoid blandness: don't settle for default blue/black/gray
- Choose one accent color that expresses the product's character; use neutral colors for the rest
- Tokenize via Tailwind `@theme {}`; eliminate magic numbers
- Contrast ratio: WCAG AA as minimum baseline

## Typography

- Font selection priority:
  1. Choose a typeface that fits the product's character (geometric → sans-serif, organic → serif)
  2. When both Latin and CJK are needed, consider pairing
  3. Fall back to Inter / Noto Sans JP as last resort
- Font sizes: base on Tailwind `text-*` tokens; add custom tokens only when necessary
- Line height (leading): prioritize readability — body `leading-relaxed` or more, headings `leading-tight`

## Font

- Delivery: Google Fonts `<link>` tag (preload in `<head>`)
- Fallback strategy: `font-family: 'Custom', 'Noto Sans JP', system-ui, sans-serif`
- FOIT/FOUT mitigation: `font-display: swap` as default

## Icon

- React environment: `lucide-react` (lightweight, consistent)
- Vanilla HTML: Iconify CDN + `<iconify-icon>` element
- Icon size matches text: `w-4 h-4` (equivalent to `text-base`) as base unit

## Tailwind

- Styling: Tailwind utility classes as the foundation
- Custom values: define tokens in `@theme {}`
- Version: v4 (`@import "tailwindcss"` syntax)
- Complex components: compose classes in the component, avoid `@apply`

## Layout

- Container width: `max-w-7xl` (1280px) as standard, `max-w-4xl` for narrow layouts
- Grid: responsive pattern `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Section spacing: `py-16 md:py-24` as base unit
- Horizontal padding: common pattern `px-4 sm:px-6 lg:px-8`

## Component Patterns

- Button: `rounded-lg` + `font-medium` + `transition-colors`
- Card: `rounded-xl` + `border` + `shadow-sm` (add `hover:shadow-md` when needed)
- Input: `rounded-md` + `border` + `focus:ring-2` + `focus:ring-offset-2`
- Each component switches variants (size, color) via props
