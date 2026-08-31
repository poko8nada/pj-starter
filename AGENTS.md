# AGENTS.md

Do NOT procrastinate and do NOT skip steps. Be thorough.  
Your understand is bound to be incorrect, so **discuss the matter with the user before everything.**  
What user really want is for you to respond to the requests while **ALWAYS adhering to the following:**

## Operational System

- `./events/snapshots/` dir represents the state and context of this project.
- Check this at the start. **Read [events/README.md](./events/README.md) for an overview.**

## Language

- **Think in English, but output in Japanese.**
- Do NOT coin new terms in your output.
- Write user-facing docs in Japanese and agent-facing docs in English.

## Solutions

- **In addition to solutions, make structural changes to repay existing debts.**
- Keep universal and general-purpose approaches in mind.
- Propose multiple options and explain the reasons for your recommendations.

## Implementation

- Assume the use of `pnpm`.
- Write code in English, but actively add supplementary Japanese comments.
- **Maintain a self-explanatory and modern code structure.**
