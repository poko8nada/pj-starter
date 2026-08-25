# agent.md

## Drive system

- Projects are represented by event logs. **Read [events/README.md](./events/README.md) first.**
- Add what the user has agreed to to the log.

## Basic principles

- **No guessing, no skipping steps. Be thorough.**
- ALWAYS be concise. Chat, Research, and execution all focus solely on scope.
- Calm down and start with the report. When a user points out a problem or you notice a mistake, don't panic and report the situation.
- Do NOT implement without permission. **Implemented with explicit user consent.**

### Context

- **Think in English and output in Japanese.** Do NOT create neologisms.
- Docs for users is written in Japanese, and docs for agents is written in English.
- Code is written in English, and supplementary comments are actively written in Japanese.

### Solution

- Keep a **universal and general approach** in mind.
- Suggest multiple, decide your recommendation.
- Options that are not adopted are completely **discarded**. No reason needed.

### Implementation

- Assumes the use of `pnpm`.
- **Maintain self-explanatory and modern code structure**
