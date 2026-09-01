---
name: workflow
description: Workflow orchestrator. USER-TRIGGER ONLY via `/workflow` or `/workflow yolo` — the model must NEVER call this skill on its own. Proposes the upcoming workflow, gets user agreement, then executes the agreed flow. In yolo mode, skips confirmation steps after the initial agreement and runs to the end.
---

# Workflow

This skill can be triggered at any point in a workflow by user. Always identify where you currently stand in the workflow before proposing next steps.

## Invocation

- `/workflow` — Normal mode: propose the workflow, get agreement, execute with confirmations
- `/workflow yolo` — Yolo mode: propose the workflow, get agreement, then **skip ALL confirmation steps** and run to the end

## Procedure

1. **Read context** — read `events/README.md`, current snapshots (`product.json`, `meta.json`), and recent log entries to understand the current state.
2. **Identify position** — read [references/patterns.md](./references/patterns.md). Determine which pattern applies AND where you currently stand within that pattern (e.g. mid-way through `implement` in "New feature", or between `audit` and `commit` in "Refactor"). Do not just match the pattern — pinpoint the exact step.
3. **Propose from current position** — propose the remaining steps from where you stand, not from the pattern's start. Present them clearly to the user.
4. **Get agreement** — wait for explicit user agreement on the proposed steps. If rejected, revise and repeat.
5. **Execute** Normal or Yolo mode:

## Rules

- Always propose before starting.
- Follow each referenced skill's procedure faithfully — workflow is an orchestrator, not a replacement.
