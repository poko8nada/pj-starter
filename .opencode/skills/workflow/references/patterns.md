# Workflow Patterns

General patterns that can pass through the workflow. Every pattern that includes implementation ends with **audit → commit**.

## Pattern Catalog

### Implementation patterns

- **Feature → implement**: feature → agenda → implement → audit → commit — Register definition first, then plan and implement
- **Recon → feature**: recon → feature — Research then register definition (implement later)
- **Research → implement**: recon → agenda → implement → audit → commit — Investigate before building
- **Refactor**: refactor → audit → commit — Restructuring existing code
- **Mockup → implement**: mockup → agenda → implement → audit → commit — Decide look first, then build
- **Mockup only**: mockup — Create mockup, no implementation

### Non-implementation patterns

- **Feature registration only**: feature — Record definition, implement later
- **Docs update**: readme → audit → commit — Update documentation
- **Recon only**: recon — Research and record, no implementation

### Recon sub-patterns

Recon itself has three variants — the workflow after recon depends on which variant was used:

- **web research**: what exists, official site / GitHub presence
- **spike verification**: can this actually be integrated
- **comparison**: which candidate fits best

## Stage Vocabulary

All work units share the stage vocabulary: `planned` → `ready` → `implement` → `commit`.

## Audit Rule

**Every implementation ends with audit before commit.** No exceptions. Audit reviews the pending changes against best practices; commit closes the work unit only after audit passes.
