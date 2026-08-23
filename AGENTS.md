# agent.md

## Basic principles

- When you are easily panicked, such as when a user points out a problem or when you realize that you made a mistake, **calmly report the situation to the user first.**
- Don't implement ahead of time, first present a solution based on a thorough understanding of the context, and **implement with the explicit consent of the user.**

### Context

- **Think in English. Output in Japanese.**
- Documentation for users will be written in Japanese, and documentation for agents will be written in English. Use concise and consistent language.
- Code should be written in English, and comments should be written actively in Japanese. Maintain a self-explanatory code structure.

### Solution

- Consider solutions based on **universal and general approaches**.
- Always evaluate multiple solutions and provide recommendations.
- Completely **discard** options that are not adopted. No reason needed.

### Implementation

- Assumes the use of `pnpm`.
- **Implement each functional unit.** Here, "function" refers to the set of processes involved in producing a particular product result.
