# Meta presentation format

Present the plan in this format when the domain is meta. Output it as rendered markdown in chat — never inside a code fence.

## Example

```markdown
# Agenda: audit skill implementation

Domain: meta

## Component (from snapshots/meta.json)

- **Purpose:** 生成物をログで絞り込みレビューする
- **Stage:** planned

## Impact scope

- `.opencode/skills/audit/SKILL.md` — target (create)

## Orders

### 1. SKILL.md creation

- Target: `meta.skills.audit`
- Depends on: none
- Files:
  - `.opencode/skills/audit/SKILL.md` (create)
    - review procedure and scoping rules
- Tests:
  - none (documentation)
- Surface:
  - skill triggers and presents the review procedure
```

## Rules

- The component's `purpose` anchors the decomposition; there is no route mapping
- Impact scope lists every file the change touches, each tagged with the scope condition that brought it in (target / shared / test / …)
- Component block labels are the only bold text; order fields stay plain with inline code for paths and keys
- Test criteria apply unchanged (code → pure/boundary tests; documentation → none)
