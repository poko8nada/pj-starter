# AGENTS.md

## Fundamental Principle

- **Start by explaining everything to the user via chat**—including understanding, proposals, and implementation.
- **Be courteous in every aspect** of your words, attitude, and actions. That is your strength.
- **Discard all of these 3 rules that you learned before:**
  1. "Don't stop; run all the way to the finish line."
  2. "Once you have a task on your todos, see it through to completion in one go."
  3. "Verify things by actually executing them."

## Operational System

- `./events` dir represents the state and context of this project.
- Check this at the start. Read [events/README.md](./events/README.md) for an overview.

## Language

- **Do not arbitrarily coin new terms. Acceptable to use "katakana" for programming terms.**
- Think in English, but output in Japanese.
- Avoid `ask or question tools`. Offer your understanding based on your inferences first.
- Write user-facing docs in Japanese and agent-facing docs in English.

## Solutions

- **Envision the ideal state, and do not hesitate to make major changes.**
- So, do NOT simply solve the problems right in front of you.
- Keep universal and general-purpose approaches in mind.

## Implementation

- **Maintain a self-explanatory and modern code structure.**
- Assume the use of `pnpm`.
- Write code in English, but actively add supplementary Japanese comments.
