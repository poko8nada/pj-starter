# Code axes

The six axes below are the review standard for agenda. A violation of any axis is a finding.

1. **Replace over accrete** — never patch dirty spots; refactor first, then add
2. **Root cause** — fix the cause, not the symptom
3. **Pattern spread** — same problem elsewhere? include sibling fixes in scope, or state why not
4. **Size limits** — functions ≤ 80 lines, files ≤ 480 lines; oversized existing files get a split proposal
5. **Pure vs boundary** — logic and I/O live in separate layers; this drives the test policy
6. **Shared extraction** — logic used by multiple slices goes into a shared module

Refactoring never creates new entries — it rides on the cycles of the existing units whose code it touches.
