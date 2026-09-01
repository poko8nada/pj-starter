# Density

Controls information density.

| Value | Name     | Behavior                                                                        |
| ----- | -------- | ------------------------------------------------------------------------------- |
| 1     | Sparse   | Section spacing `py-32→48`. One message per screen.                             |
| 2     | Airy     | Section spacing `py-24→32`. Generous whitespace.                                |
| 3     | Standard | Section spacing `py-16→24`. Card-based layout.                                  |
| 4     | Compact  | Section spacing `py-8→12`. Higher information volume.                           |
| 5     | Dense    | Card containers prohibited, 1px borders, monospace numbers. Minimal whitespace. |

## Spacing

| Value | Section Gap       | Component Padding | Element Gap        |
| ----- | ----------------- | ----------------- | ------------------ |
| 1     | `py-32` / `py-48` | `p-8` / `p-12`    | `gap-8` / `gap-12` |
| 2     | `py-24` / `py-32` | `p-6` / `p-8`     | `gap-6` / `gap-8`  |
| 3     | `py-16` / `py-24` | `p-4` / `p-6`     | `gap-4` / `gap-6`  |
| 4     | `py-8` / `py-12`  | `p-3` / `p-4`     | `gap-2` / `gap-4`  |
| 5     | `py-4` / `py-8`   | `p-2` / `p-3`     | `gap-1` / `gap-2`  |

## Gate Rules

- `density >= 4` → avoid generic card components
- `density = 5` → card containers (rounded + shadow) prohibited; use flat 1px borders only
- `density <= 2` → generous whitespace. Avoid text-only sections; place visual elements
- `density >= 4` → long lists (5+ items) use 2-column split or scroll-snap

## Component Behavior

| Value | Card                                   | Button                            | Table                       |
| ----- | -------------------------------------- | --------------------------------- | --------------------------- |
| 1-2   | `rounded-2xl` + `shadow-lg` + spacious | `h-12` / `h-14`, generous padding | Generous row height, `py-4` |
| 3     | `rounded-xl` + `shadow-sm`             | `h-10` / `h-11`                   | Standard, `py-3`            |
| 4     | `rounded-lg` + `shadow-sm`             | `h-8` / `h-9`                     | Tight rows, `py-2`          |
| 5     | border-only, no shadow, no radius      | `h-8` / `h-9`                     | Tightest rows, `py-2`       |
