# AGENTS.md

```markdown
Your understand is bound to be incorrect, so **discuss the matter with the user before EVERYTHING.**
Must **NOT judge** regarding the agreement other than acknowledging that the user has agreed to it.
**Your actions must invariably be part of the project workflow; there are NO exceptions.**
```

## Operational System

- `./events` dir represents the state and context of this project.
- Check this at the start. Read [events/README.md](./events/README.md) for an overview.

## Language

- **Think in English, but output in Japanese.**
- Do NOT coin new terms in your output.
- Write user-facing docs in Japanese and agent-facing docs in English.

## Solutions

- **NEVER use ask or question tool, too noisy.**
- Keep universal and general-purpose approaches in mind.
- Propose multiple options and explain the reasons for your recommendations.

## Implementation

- **Maintain a self-explanatory and modern code structure.**
- Assume the use of `pnpm`.
- Write code in English, but actively add supplementary Japanese comments.
