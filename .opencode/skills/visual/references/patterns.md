# Patterns

Dial values and pattern choices for common contexts.

## Dashboard

| Dial    | Typical | Range |
| ------- | ------- | ----- |
| motion  | 1       | 1-2   |
| density | 3       | 2-5   |

**motion=1**: Data is the protagonist. No animation. Hover states only.
**motion=2**: Subtle hover feedback on data points, row highlights.

**density=2** (Premium dashboard — Linear, Vercel, Stripe):

- Card-based, generous whitespace
- Key metrics as large numbers, minimal chrome
- Navigation: sidebar or top bar, single line

**density=3** (Standard SaaS admin):

- Card grid, table views
- Standard padding, clear hierarchy
- Filters and actions in header

**density=4** (Analytics dashboard):

- Tighter spacing, more data per screen
- Multi-column tables, dense charts
- Minimal card chrome

**density=5** (Operations / NOC):

- Table-dominant, no card containers
- Monospace numbers, 1px borders
- Real-time indicators, minimal whitespace

## Landing Page

| Dial    | Typical | Range |
| ------- | ------- | ----- |
| motion  | 3       | 2-5   |
| density | 2       | 1-3   |

**motion=3**: Standard scroll reveals, subtle hover transitions.
**motion=4**: Scroll-triggered section reveals, parallax hero.
**motion=5**: Full scroll choreography, pinned sections, horizontal pans.

**density=1** (Hero-focused / Apple-style):

- One message per section, large imagery
- Generous whitespace, single CTA
- Typography-driven hierarchy

**density=2** (Standard marketing):

- Feature grid (3-4 features, not 3 identical cards)
- Social proof, pricing, FAQ
- Balanced text and imagery

**density=3** (Feature-rich / SaaS):

- Multiple sections with dense content
- Comparison tables, integration logos
- Multiple CTAs with clear hierarchy

## Portfolio

| Dial    | Typical | Range |
| ------- | ------- | ----- |
| motion  | 3       | 2-5   |
| density | 2       | 1-3   |

**motion=3**: Subtle hover on project cards, fade-in on scroll.
**motion=4-5**: Experimental, scroll-driven storytelling.

**density=1** (Minimal / designer):

- Full-bleed images, minimal text
- Project title + year only
- Maximum whitespace

**density=2** (Standard):

- Project grid with thumbnails
- Short descriptions, tags
- About section with bio

## Admin / Settings

| Dial    | Typical | Range |
| ------- | ------- | ----- |
| motion  | 1       | 1-2   |
| density | 3       | 3-5   |

**motion=1**: Static. Forms and tables don't need animation.
**motion=2**: Form focus states, button feedback.

**density=3** (Standard settings):

- Form sections with clear labels
- Single column, `max-w-lg`
- Help text below inputs

**density=4-5** (Power user / developer settings):

- Multi-column form layouts
- Code blocks, JSON editors
- Dense tables with inline editing

## Corporate Website

| Dial    | Typical | Range |
| ------- | ------- | ----- |
| motion  | 2       | 1-3   |
| density | 2       | 2-4   |

**motion=2**: Subtle hover on cards, nav dropdown fade. No scroll choreography.
**motion=3**: Section fade-in on scroll for key pages (top, services).

**density=2** (Premium corporate — consulting, law firm, executive):

- Large hero imagery or full-bleed photography
- Minimal text, generous whitespace
- Service overview as 2-3 cards with icons
- Leadership team as photo grid
- Trust signals: client logos, certifications

**density=3** (Standard corporate):

- Hero with headline + subtext + CTA
- Services/features grid (3-4 columns)
- News/insights section with card grid
- Contact form with location map
- Footer with sitemap links

**density=4** (Information-heavy — investor relations, documentation):

- Dense navigation with multi-column dropdown
- Document tables with sorting
- FAQ accordion, detailed specs
- Multiple CTAs per section
- Sidebar navigation for sub-pages

## E-commerce

| Dial    | Typical | Range |
| ------- | ------- | ----- |
| motion  | 2       | 1-4   |
| density | 3       | 2-4   |

**motion=2**: Image zoom on hover, add-to-cart feedback.
**motion=3-4**: Gallery transitions, cart animations.

**density=2** (Luxury / curated):

- Large product imagery, minimal text
- One product per screen on mobile
- Generous whitespace

**density=3** (Standard):

- Product grid (3-4 columns)
- Filters sidebar, sorting
- Standard cards with price, title, rating

**density=4** (Marketplace / search results):

- Compact product cards
- Many filters, quick-view
- Density over aesthetics
