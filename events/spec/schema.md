# Snapshot Schema Specification

This document defines the content schemas of the snapshots: what every `product.*` and `meta.*` section means, and how to write entries for each collection.

The shared node model — fact sections vs work units, `status` shapes, the stage vocabulary, whole-status assertions, validation — is specified once in [../README.md](../README.md#recording-contract) (Recording contract) and is not redefined here; the entries below reference it rather than repeating it. Log format, compaction, and rebuild mechanics also live there.

## product

`product.*` describes the artifacts the project produces. The second segment is fixed to these seven sections:

| Section    | Kind       | Content                                          |
| ---------- | ---------- | ------------------------------------------------ |
| `name`     | fact       | `{ "value": "…" }`                               |
| `what`     | fact       | `{ "value": "…" }`                               |
| `stack`    | fact       | Technology stack (fixed groups below)            |
| `look`     | fact       | Design direction                                 |
| `features` | collection | Map of work-unit slices (see **Features** below) |
| `roadmap`  | fact       | `{ "mvp": [featureId…], "v1": [featureId…] }`    |
| `deploy`   | fact       | Delivery process                                 |

### stack

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
  "helpers":  { "…in-house utilities…" },
  "status": { "text": "build グループに pnpm を追加" }
}
```

- `framework` subkeys: `meta` (full-stack/meta-framework: Next.js standalone, Nuxt, Astro, Honox), `client`, `server`, `bridge` (Inertia.js, HTMX). Combinations fit the same shape: Next.js full-stack → `{"meta":"Next.js"}`; Next.js + Hono → `{"client":"Next.js","server":"Hono"}`
- `build.bundler` records only bundlers the project operates directly. Framework-internal bundlers (e.g. Turbopack inside Next.js) are not double-recorded; omit the whole `build` group then
- `libraries` / `helpers` are the catch-alls for long-tail dependencies and in-house utilities. Do not spawn ad-hoc sibling keys for them

### look

```json
{
  "tone": "concise, technical",
  "theme": "monochrome base",
  "mockups": { "lp-a": { "path": "mockups/lp-a.html", "description": "first draft" } }
}
```

`mockups` links static HTML produced by the mockup skill. It is an ID map, not an array, so events can address entries as `look.mockups.<id>`.

### features

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
    ],
    "status": { "stage": "implement", "text": "submit_handlerまで実装済み" },
    "updatedAt": "20260825"
  }
}
```

One lifecycle field exists on every slice. Assert it whole at creation — `{"stage": "planned", "text": "未着手"}` is the canonical entry point (see [Recording contract](../README.md#recording-contract)); rebuild also guards never-asserted slices by injecting the same default:

- `status.stage` — pipeline stage (vocabulary and lifecycle rules: [Recording contract](../README.md#recording-contract))
- `status.text` — free-text progress note (what has been done so far), always written together with the stage
- `updatedAt` — injected by rebuild (YYYYMMDD)

#### Sizing & splitting

- Draft routes with **at most 3 steps**. A request needing more is split at capture time into sibling features — same depth, kebab-composed ids (`auth-session`, `auth-endpoint`) — each with its own trigger / result / sub-route; the oversized key is removed with `del`
- Each feature is sized so one working session carries it through `ready → commit`
- On re-entry (see [Recording contract](../README.md#recording-contract)), remaining route steps mark what is left of the slice

#### The completeness test

Ask: _can this unit be described as "X happens → Y results" while standing on its own?_ If explaining it requires referencing other unfinished pieces ("this renders data fetched by that other thing"), it is not a slice yet — keep splitting or merge until each unit closes its own circuit.

#### Field definitions

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

#### Decomposition procedure

1. List candidate units where a single cause yields a single observable result
2. Apply the completeness test to each candidate
3. **Stateful pairs**: when two triggers are separated in time by persisted state (login/logout, `on`/`emit`), split them into a _state-creating slice_ and a _state-consuming slice_. Never force both into one slice
4. **Reject horizontal decomposition**: "all UI components" or "all DB access" groups are not slices — they have no closed circuit
5. **Small function lists ARE valid slices** for libraries: each function completes call→result on its own, so many small slices are vertical, not horizontal fragmentation

#### Worked examples by product type

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
  "route": ["iteratee", "key_extraction", "bucket_assign"]
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
"emit_event":        { "trigger": "emit('event') is called",           "result": "All registered callbacks run",          "route": ["listener_lookup", "invoke_all"] }
```

#### Reading slices

- Passive triggers clustering across slices reveals shared mechanisms (scroll detection, lazy display)
- Long routes containing steps unique to one slice mark behavior-heavy complexity hotspots — visible without any Content/Behavior flag
- Short enumeration routes indicate simple composition

#### Boundary

Framework design contracts — component composition models, plugin extension points, reactivity architecture — cannot be reduced to trigger/result slices. They are cross-slice constraints and belong to architecture prose outside snapshots. Do not force them into features.

### roadmap

```json
{ "mvp": ["contact_form"], "v1": [], "status": { "text": "MVP構成を確定" } }
```

Arrays of feature IDs only. Membership expresses delivery intent: what MVP ships versus what v1 adds. There is no stage vocabulary here — implementation intent lives here, identity lives in the slice itself.

### deploy

```json
{
  "target": "Cloudflare Workers",
  "method": "wrangler deploy",
  "pipeline": "GitHub Actions",
  "environments": { "staging": "…", "production": "…" }
}
```

All four keys optional. Static sites use `method: "rsync"`; libraries use `method: "npm publish"`.

## meta

`meta.*` describes the **driving machinery** of the project: everything that operates the project rather than the output it produces.

### Boundary definition

> **meta = the machinery that drives and operates the project.**
> **product = the artifacts that machinery produces.**

Practical consequences:

- Agent-executed layers (plugins, skills, driving docs) belong here
- Quality gates (pre-commit enforcement) belong here — they drive how work ships
- Plain tool _configuration files_ are not inventoried individually; they appear only as part of a gate-level entry (see Granularity policy)

### Sections

The second segment of a `meta.*` key is fixed to these five:

| Section   | Contents                                                                           |
| --------- | ---------------------------------------------------------------------------------- |
| `harness` | Hook runtimes and plugin wiring (harness-dependent execution layer), quality gates |
| `agents`  | Sub-agents (opencode agent definitions)                                            |
| `skills`  | Skills, including ones merely planned                                              |
| `docs`    | Driving documents (AGENTS.md, events specs)                                        |
| `scripts` | Operational scripts (root `scripts/` and `events/scripts/`)                        |

Every section is a map of components — all five are work-unit collections, so every `meta.<section>.<id>` is a work unit at the same depth as `product.features.<id>`.

### Entry shape

Every component leaf carries a `purpose`; that field marks the object as a meta component:

```json
{
  "agenda": {
    "path": ".opencode/skills/agenda/SKILL.md",
    "purpose": "Fix the unit of work per feature slice",
    "status": { "stage": "commit", "text": "…" },
    "updatedAt": "20260825"
  }
}
```

| Field     | Rule                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `path`    | Where the component lives. Omit while only planned; set once implemented |
| `purpose` | One-sentence intent. Required — its presence defines a component leaf    |

The append path enforces the integrity rule: any meta node carrying `status` must also carry `purpose`, and a node whose `status.stage` is `ready` / `implement` / `commit` must carry a `path` — regardless of whether it carries `purpose`. `append-build.mjs` fails the append when the folded state violates this.

### Granularity policy

- **One component = one purpose**, verifiable by **one surface**. An entry whose purpose needs "and" / "etc." is a bundle and must be split into sibling entries at the same depth (the oversized key is removed with `del`)
- Size each change cycle to complete within one working session (`ready → commit`)
- One entry per **entry point or mechanism** (a hook runtime, a skill, a script, a gate). Never per configuration file
- Tool configs (oxlint, oxfmt, tsconfig…) are summarized by their gate entry only — e.g. the pre-commit quality gate is one entry pointing at `lefthook.yaml`
- Library internals are reachable through the entry's `path`; do not enumerate them

The live inventory is always readable from `events/snapshots/meta.json`; this document deliberately does not duplicate it.
