# Motion

Controls animation intensity.

| Value | Name      | Behavior                                                                                         |
| ----- | --------- | ------------------------------------------------------------------------------------------------ |
| 1     | Static    | No animation. Browser-native `:hover` / `:active` only.                                          |
| 2     | Minimal   | Basic transitions (`opacity`, `color`).                                                          |
| 3     | Standard  | CSS `transition` + `transform` / `opacity`. Easing `cubic-bezier(0.16,1,0.3,1)`.                 |
| 4     | Enhanced  | Scroll-linked reveals. `whileInView` / `animation-timeline: view()`.                             |
| 5     | Cinematic | GSAP ScrollTrigger, pin/scrub. Motion must be justified by hierarchy, storytelling, or feedback. |

## Boundary

Values are clamped to 1-5. Values below 1 treated as 1, above 5 treated as 5. Non-numeric values rejected — ask the user.

## Gate Rules

- `motion >= 4` → scroll-linked animation required
- `motion >= 5` → every motion needs justification ("looks cool" is invalid)
- `motion <= 2` → no JS animation library
- `motion >= 4` → `prefers-reduced-motion` handling required

## Implementation Priority

```
CSS only → Motion (motion.dev) → GSAP
(prefer zero dependencies; escalate only when insufficient)
```

## Library Selection

| Range | Default                            | Escalation                    |
| ----- | ---------------------------------- | ----------------------------- |
| 1-3   | CSS `transition`                   | None                          |
| 4     | Motion (`motion/react` or vanilla) | GSAP for complex sequences    |
| 5     | GSAP + ScrollTrigger               | Three.js (when canvas needed) |

## Performance Guardrails

- Animate only `transform` and `opacity` (avoid layout triggers)
- Apply `will-change` only to necessary elements; remove after animation ends
- Limit simultaneous animations to ~5 elements
- Intersection Observer `threshold`: `0.1` as default
