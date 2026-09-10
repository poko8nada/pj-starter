# Motion / Density

Scales for the product `look` direction. Decided qualitatively in discussion, recorded as `{value, label}` at registration. Never feed raw numbers to image prompts.

See `schema.md` (`look`) for the registration shape.

## Motion

Animation intensity, 1-5. The normative core is CSS.

| Value | Name      | Behavior                                                                                             |
| ----- | --------- | ---------------------------------------------------------------------------------------------------- |
| 1     | Static    | No animation. Browser-native `:hover` / `:active` only.                                              |
| 2     | Minimal   | Basic transitions (`opacity`, `color`).                                                              |
| 3     | Standard  | CSS `transition` + `transform` / `opacity`. Easing `cubic-bezier(0.16,1,0.3,1)`.                     |
| 4     | Enhanced  | Scroll-linked reveals. `whileInView` / `animation-timeline: view()`.                                 |
| 5     | Cinematic | Pinned / scrubbed scroll choreography. Justify every motion by hierarchy, storytelling, or feedback. |

Values clamp to 1-5. Non-numeric values are rejected — ask the user.

### Library examples (non-normative)

Prefer zero dependencies; escalate only when CSS is insufficient. Selection itself belongs to concept / implementation, not to this scale.

- CSS `transition` for 1-3
- Motion (`motion/react` or vanilla) for 4, GSAP for complex sequences
- GSAP + ScrollTrigger for 5
- Three.js only when canvas / WebGL is needed

### Performance notes (non-normative)

- Animate only `transform` and `opacity`
- Apply `will-change` only where needed; remove after the animation ends
- Limit simultaneous animations to ~5 elements
- Intersection Observer `threshold`: `0.1` as default

## Density

Information density, 1-5. Spacing is written in plain CSS so any stack can read it.

| Value | Name     | Behavior                                                                     |
| ----- | -------- | ---------------------------------------------------------------------------- |
| 1     | Sparse   | One message per screen. Maximum whitespace.                                  |
| 2     | Airy     | Generous whitespace.                                                         |
| 3     | Standard | Card-based layout.                                                           |
| 4     | Compact  | Higher information volume. Tighter spacing.                                  |
| 5     | Dense    | Flat 1px borders, monospace numbers. Minimal whitespace. No card containers. |

### Spacing guide (CSS, non-normative)

| Value | Section gap              | Component padding | Element gap   |
| ----- | ------------------------ | ----------------- | ------------- |
| 1     | `padding-block: 8-12rem` | `2-3rem`          | `2-3rem`      |
| 2     | `padding-block: 6-8rem`  | `1.5-2rem`        | `1.5-2rem`    |
| 3     | `padding-block: 4-6rem`  | `1-1.5rem`        | `1-1.5rem`    |
| 4     | `padding-block: 2-3rem`  | `0.75-1rem`       | `0.5-1rem`    |
| 5     | `padding-block: 1-2rem`  | `0.5-0.75rem`     | `0.25-0.5rem` |

### Component guide (non-normative)

| Value | Card                              | Button                 | Table               |
| ----- | --------------------------------- | ---------------------- | ------------------- |
| 1-2   | Large radius + shadow + spacious  | Tall, generous padding | Generous row height |
| 3     | Medium radius + light shadow      | Standard height        | Standard rows       |
| 4     | Small radius + light shadow       | Compact height         | Tight rows          |
| 5     | Border-only, no shadow, no radius | Compact height         | Tightest rows       |

Gate rules, library selection decisions, and per-context defaults (patterns) live outside this file: checks ride with auditors, discussion starting points ride with concept.
