---
name: recon
description: Pre-implementation research and recording. Use when the user wants to investigate before building (調査して / 調べて / リサーチして / recon して). Picks the research pattern by the question type and delegates to a sub-agent (web research for what exists, spike verification for whether it actually works).
---

# Recon

Turn a pre-implementation question into a recorded research result. Never implement inside recon.

## Scope

- Recon answers "what exists" and "does it actually work" — it never builds or decides adoption.
- Adoption decisions belong to the user; recon only supplies the material.
- One recon = one research question; a question may cover multiple candidates. Split unrelated questions into separate sessions.

## Pattern selection

Choose the pattern by the question type:

| Question type                                                                      | Pattern            | Sub-agent           |
| ---------------------------------------------------------------------------------- | ------------------ | ------------------- |
| What libraries / frameworks / technologies exist? Official site / GitHub presence? | web research       | web-researcher      |
| Can this library actually be integrated? Does build / typecheck / tests pass?      | spike verification | spike-verifier      |
| Which candidate fits best among several?                                           | comparison         | both, per candidate |

When in doubt, ask the user which pattern fits.

## Granularity

**One sub-agent = one candidate** (a library, framework, service, or other evaluation target). Never pass multiple candidates to a single sub-agent.

- Single candidate — spawn one sub-agent
- Multiple candidates — spawn one sub-agent per candidate, in parallel, then compare in the main agent
- Exception: web research discovers candidates — one query may return multiple candidates. The granularity rule applies to research on decided candidates (spike verification, detailed research)

## Responsibilities

|          | Main agent (YOU)                                                 | web-researcher / spike-verifier   |
| -------- | ---------------------------------------------------------------- | --------------------------------- |
| Scope    | Decide the question, pick the pattern, list candidates           | Receive one candidate only        |
| Research | Never (delegate to the sub-agent)                                | Run the assigned pattern only     |
| Judgment | Compare candidates, aggregate results, present adoption material | Never                             |
| Output   | Present the comparison / aggregated result                       | Return findings in a fixed format |

## Procedure

1. **Clarify the question** — what is being researched and why.
2. **Pick the pattern** — web research, spike verification, or comparison (see Pattern selection).
3. **List the candidates** — from the user's request or the web research results. One candidate per sub-agent.
4. **Spawn the sub-agent(s)** — one Task call per candidate with the matching sub-agent. Pass a research query for web research, or a candidate and verification conditions for spike verification. Spawn multiple candidates in parallel. The sub-agent reads nothing outside its input.
5. **Aggregate** — collect the fixed-format outputs returned by the sub-agents.
6. **Compare** — for multiple candidates, present them side by side (fit, risk, adoption signals).
7. **Record** — when the user agrees the result is worth keeping, record it (e.g. the runbook) in the main project. Recording is the main agent's responsibility — sub-agents never write outside their worktree.
8. **Present** — show the result with your own assessment (fit, risk, open questions). Do not decide adoption yourself.

## Rules

- Never research directly — always delegate to the sub-agent
- Never pass more than one candidate to a sub-agent
- Never modify code in the main project during recon (sub-agents may write inside their worktree)
- Never decide adoption; present material only
- The sub-agent's output is consumed as-is; do not override its findings
- Record the research result only when the user agrees it is worth keeping

## Status semantics

- `planned` — recorded intention. Everything captured starts here, even when the user consented at capture time
- `ready` — passed agenda consensus; awaiting implementation
- On consensus: one status assertion per target — `node events/scripts/append.mjs --set <key>.status '{"stage":"ready","text":"<progress>"}'`. Multiple targets can share one invocation (one shared ts)
- No manual build: the idle hook syncs snapshots after the turn ends
