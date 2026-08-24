# Product Snapshot Specification

`events/snapshots/product.json` is a generated artifact, folded from `product.*` events by `rebuild`. Hand-authoring it is forbidden. This document defines what every section means and how to write features for any product type.

## Envelope

```json
{
  "generatedAt": "2026-08-24T05:20:00Z",
  "upToSeq": 10,
  "content": {}
}
```

- `generatedAt` — when this snapshot was computed; refreshed on every rebuild
- `upToSeq` — the last log seq folded in. Smaller than the log's latest seq means the snapshot is stale
- Consumers read `content` only

## Sections

The second segment of a `product.*` key is fixed to these seven:

| Section    | Type   | Definition                                    |
| ---------- | ------ | --------------------------------------------- |
| `name`     | string | Product name                                  |
| `what`     | string | One-sentence description                      |
| `stack`    | object | Technology stack (fixed groups below)         |
| `look`     | object | Design direction                              |
| `features` | object | Map of slices (see **Features** below)        |
| `roadmap`  | object | `{ "mvp": [featureId…], "v1": [featureId…] }` |
| `deploy`   | object | Delivery process                              |

## stack

Two scalars plus fixed groups. **Omit keys that do not apply** — a backend-only library has no frontend/data groups.

```json
{
  "runtime": "Node.js 22+",
  "language": "TypeScript",
  "framework": { "meta": null, "client": "Next.js", "server": "Hono", "bridge": null },
  "frontend": { "styling": "Tailwind CSS", "components": "shadcn/ui", "state": "TanStack Query" },
  "backend":  { "api": "REST", "validation": "zod", "auth": "Auth.js" },
  "data":     { "database": "Turso", "orm": "Drizzle", "cache": null },
  "testing":  { "unit": "vitest", "e2e": "Playwright" },
  "build":    { "bundler": "Vite", "packageManager": "pnpm" },
  "observability": { "errors": "Sentry", "analytics": null },
  "content":  { "cms": "microCMS" },
  "libraries": { "…other external dependencies…" },
  "helpers":  { "…in-house utilities…" }
}
```

- `framework` subkeys: `meta` (full-stack/meta-framework: Next.js standalone, Nuxt, Astro, Honox), `client`, `server`, `bridge` (Inertia.js, HTMX). Combinations fit the same shape: Next.js full-stack → `{"meta":"Next.js"}`; Next.js + Hono → `{"client":"Next.js","server":"Hono"}`
- `build.bundler` records only bundlers the project operates directly. Framework-internal bundlers (e.g. Turbopack inside Next.js) are not double-recorded; omit the whole `build` group then
- `libraries` / `helpers` are the catch-alls for long-tail dependencies and in-house utilities. Do not spawn ad-hoc sibling keys for them

## look

```json
{
  "tone": "concise, technical",
  "theme": "monochrome base",
  "mockups": { "lp-a": { "path": "mockups/lp-a.html", "note": "first draft" } }
}
```

`mockups` links static HTML produced by the mockup skill. It is an ID map, not an array, so events can address entries as `look.mockups.<id>`.

## features

A feature is a **vertical slice**: the smallest unit that independently completes a circuit from an initiating cause (`trigger`) to an observable result (`result`). Write one slice per key; the leaf requires exactly three fields:

```json
{
  "contact_form": {
    "trigger": "User fills the contact form and presses submit",
    "result": "A completion message is shown and the operator is notified",
    "route": [
      "form_input",
      "validation",
      "submit_handler",
      "notification_dispatch",
      "thanks_message"
    ]
  }
}
```

Two optional lifecycle fields exist on every slice — **omit them at creation**; `rebuild` injects the defaults (`"status": "planned"`, `"isDone": false`) so snapshots always carry them:

- `status` — pipeline stage: `planned` → `ready` → `implement` → `audit` → `commit`
- `isDone` — boolean; whether the slice is genuinely complete. Independent of `status`: a committed slice can still be `false`

Lifecycle transitions are ordinary `set`s on deep keys — one line, one concern:

```jsonl
{"ts":"…","type":"set","key":"product.features.contact_form.status","value":"implement","note":"uw-001"}
{"ts":"…","type":"set","key":"product.features.contact_form.status","value":"audit"}
{"ts":"…","type":"set","key":"product.features.contact_form.status","value":"commit"}
{"ts":"…","type":"set","key":"product.features.contact_form.isDone","value":true}
```

### The completeness test

Ask: _can this unit be described as "X happens → Y results" while standing on its own?_ If explaining it requires referencing other unfinished pieces ("this renders data fetched by that other thing"), it is not a slice yet — keep splitting or merge until each unit closes its own circuit.

### Field definitions

**trigger** — the initiating cause. All of these are valid forms:

- Active operation: "User submits the contact form"
- Passive arrival: "Visitor scrolls to the pricing section", "Top page is requested"
- Programmatic invocation: "The function returned by `debounce(fn, wait)` is called multiple times"
- Compile-time application: "`PickPartial<T, K>` is applied to type T"

For type-level APIs, generalize trigger/result from runtime causality to input/output correspondence instead of forcing runtime wording.

**result** — the observable outcome in one sentence: what a user or system can perceive or obtain afterwards.

**route** — an array of lowercase_snake step IDs. Two legitimate readings coexist and are deliberately **not distinguished at this stage**:

- A processing chain: input → validation → submit → notify → display
- A parallel composition enumeration: copy + visual + CTA rendered together

Do not add flags or nested structure to separate them; premature distinction adds attributes without practical gain.

### Decomposition procedure

1. List candidate units where a single cause yields a single observable result
2. Apply the completeness test to each candidate
3. **Stateful pairs**: when two triggers are separated in time by persisted state (login/logout, `on`/`emit`), split them into a _state-creating slice_ and a _state-consuming slice_. Never force both into one slice
4. **Reject horizontal decomposition**: "all UI components" or "all DB access" groups are not slices — they have no closed circuit
5. **Small function lists ARE valid slices** for libraries: each function completes call→result on its own, so many small slices are vertical, not horizontal fragmentation

### Worked examples by product type

Content website (passive triggers dominate):

```json
"hero_section": {
  "trigger": "Visitor opens the top page",
  "result": "Value proposition and CTA button are displayed",
  "route": ["hero_copy", "hero_visual", "cta_button"]
},
"testimonials_section": {
  "trigger": "Visitor scrolls to the testimonials section",
  "result": "Client logos and quotes are displayed",
  "route": ["testimonial_cards", "logo_grid"]
}
```

Web application (active trigger, long route):

```json
"contact_form": {
  "trigger": "User fills the contact form and presses submit",
  "result": "A completion message is shown and the operator is notified",
  "route": ["form_input", "validation", "submit_handler", "notification_dispatch", "thanks_message"]
}
```

Backend-only library (function signatures map directly):

```json
"debounce": {
  "trigger": "The function returned by debounce(fn, wait) is called multiple times",
  "result": "fn runs exactly once after calls have stopped for wait",
  "route": ["timer_reset", "timer_schedule", "invoke"]
},
"array_group_by": {
  "trigger": "groupBy(array, iteratee) is called",
  "result": "An object keyed by iteratee's return values is returned",
  "route": ["iterate", "key_extraction", "bucket_assign"]
}
```

Type-level API:

```json
"pick_partial_type": {
  "trigger": "PickPartial<T, K> is applied to type T",
  "result": "A type with only the properties in K made optional is produced",
  "route": ["key_filter", "optional_mapping"]
}
```

Stateful API pair (split, do not merge):

```json
"register_listener": { "trigger": "on('event', cb) is called", "result": "cb is registered as a listener", "route": ["listener_store"] },
"emit_event":        { "trigger": "emit('event') is called",        "result": "All registered callbacks run",          "route": ["listener_lookup", "invoke_all"] }
```

### Reading slices

- Passive triggers clustering across slices reveals shared mechanisms (scroll detection, lazy display)
- Long routes containing steps unique to one slice mark behavior-heavy complexity hotspots — visible without any Content/Behavior flag
- Short enumeration routes indicate simple composition

### Boundary

Framework design contracts — component composition models, plugin extension points, reactivity architecture — cannot be reduced to trigger/result slices. They are cross-slice constraints and belong to architecture prose outside snapshots. Do not force them into features.

## roadmap

```json
{ "mvp": ["contact_form"], "v1": ["export_pdf"] }
```

Arrays of feature IDs only. Membership expresses delivery intent: what MVP ships versus what v1 adds. There is no status vocabulary — implementation intent lives here, identity lives in the slice itself.

## deploy

```json
{
  "target": "Cloudflare Workers",
  "method": "wrangler deploy",
  "pipeline": "GitHub Actions",
  "environments": { "staging": "…", "production": "…" }
}
```

All four keys optional. Static sites use `method: "rsync"`; libraries use `method: "npm publish"`.
