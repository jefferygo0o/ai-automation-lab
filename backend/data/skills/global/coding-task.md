---
id: coding-task
name: Coding Task
description: Tackle a coding task in the sandbox: read project, plan, write code, run tests, iterate.
inputs:
  - name: goal
    description: a single, well-defined coding objective
    type: string
    required: true
---

# Coding Task

A reusable procedure for tackling a coding task end-to-end inside the agent's sandbox.

## When to use this skill

Trigger when the user asks for:
- "implement X", "fix this bug", "add a feature", "refactor Y"
- A focused, well-scoped coding objective in an existing project

## Procedure

1. Use `list_files` and `read_file` to map the codebase before touching anything.
2. Write a short plan in a scratch file (`/tmp/plan.md` or in the sandbox) before editing real source.
3. Make focused, minimal changes — avoid drive-by refactors.
4. Run tests / typecheck after each meaningful edit.
5. Update agent `memory.md` with non-obvious facts about the codebase that future runs would benefit from.

## Inputs

- `goal` (required): a single, well-defined coding objective.

## Completion criteria

- The requested change is implemented.
- Tests pass (or the user has been informed why they don't).
- Any new, non-obvious facts about the codebase are saved to memory.