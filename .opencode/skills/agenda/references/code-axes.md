# Code axes

The review standard for agenda. The axes cover two viewpoints: impact-scope identification and rebuild-not-accrete. The agenda-reviewer checks ONLY these two viewpoints; the design considerations below are handled by the main agent in the design step.

## Impact scope

The impact scope is the set of files the change touches. A file is in scope when it matches any condition:

1. **Target** — the file the change is primarily about (the seed of the scope)
2. **Dependency** — the target imports it, or it imports the target
3. **Caller** — it calls the functions the change modifies
4. **Sibling** — it sits in the same module or directory as the target
5. **Shared** — it holds logic used by multiple slices (shared module)
6. **Contract** — it defines types, schemas, or API contracts the change touches
7. **Test** — it covers the behavior the change modifies

## Rebuild not accrete

The target feature is rebuilt together with its impact scope, never added onto:

8. **Replace over accrete** — never patch dirty spots; refactor first, then add
9. **Root cause** — fix the cause, not the symptom
10. **Pattern spread** — same problem elsewhere? include sibling fixes in scope, or state why not

## Design considerations (main agent only, not reviewer scope)

11. **Size limits** — functions ≤ 80 lines, files ≤ 480 lines; oversized existing files get a split proposal
12. **Pure vs boundary** — logic and I/O live in separate layers; this drives the test policy

Refactoring never creates new entries — it rides on the cycles of the existing units whose code it touches.
