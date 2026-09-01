# Motion Principles

Scroll trigger and interaction principles, library selection, and performance guardrails.

## Scroll Trigger Principles

- Avoid "motion for motion's sake": only use motion that aids content understanding
- Default scroll trigger timing: fire when element enters viewport
- Delay in `0.1s` increments; excessive delays cause users to leave
- Repeat off by default: once revealed, stay revealed (`whileInView` + `initial` combination)

## Interaction Principles

- Consider three states: hover / focus / active
- Transition duration: `150-300ms` (longer feels laggy)
- Easing: `ease-out` as default (accelerate in, decelerate out)
- Click feedback is mandatory: operations without visual response feel unresponsive

## Library Selection

### Default: Motion (motion.dev)

- React: `motion/react` → `<motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>`
- Vanilla: `motion` → `animate(element, { opacity: 1 })`
- Scroll trigger: `inView()` function (vanilla) / `whileInView` prop (React)
- Declarative and concise; default for both React and Vanilla

### Lightweight fallback: CSS only

- `animation-timeline: scroll()` for zero-dependency scroll-linked animation
- Works in supporting browsers (Chrome 115+) with no additional JS
- Simple fade-in / slide-in is sufficient with CSS alone

### Escalation: GSAP

- When Motion cannot express complex timeline control
- SVG morphing, multi-element coordinated sequences, scrub control
- Bundle size increase is acceptable under conditions

### Selection priority

```
CSS only → Motion → GSAP
(prefer zero dependencies; escalate only when insufficient)
```

## Performance Guardrails

- Maintain 60fps: animate only `transform` and `opacity` (avoid layout triggers)
- Apply `will-change` only to necessary elements; remove after animation ends
- Disable motion when `prefers-reduced-motion: reduce` is set
- Limit simultaneous animations to ~5 elements
- Intersection Observer `threshold`: `0.1` as default (0 causes delayed firing)
