# Meta presentation format

Present the plan in this format when the domain is meta.

```
Agenda: audit skill implementation
Domain: meta

Component (from snapshots/meta.json):
  Purpose: 生成物をログで絞り込みレビューする
  Stage:   planned

Order:
  1. SKILL.md creation
     Target: meta.skills.audit
     Depends on: none
     Files:
       - .opencode/skills/audit/SKILL.md (create)
         - review procedure and scoping rules
     Tests:
       - none (documentation)
     Surface:
       - skill triggers and presents the review procedure
```

## Rules

- The component's `purpose` anchors the decomposition; there is no route mapping
- Test criteria apply unchanged (code → pure/boundary tests; documentation → none)
