# Ultimate AI Automation Lab Architecture

## Goal
Build a production-ready multi-agent platform where users can create, configure, test, and deploy AI agents that execute real-world automations with skills, memory, MCP tools, sandboxed execution, and execution logs.

## System layers

### 1. UI layer
- React SPA in `frontend/`
- Core screens: Agents, Agent Editor, Chat, Skills, MCP, Secrets, Runs, Automations, Browser, Files, Web Space
- Streaming chat UI for reasoning, tool calls, and run history

### 2. API layer
- Bun + Hono server in `backend/src/api/server.ts`
- Auth, agents, chats, skills, MCP, memory, secrets, runs, sandbox, web space, workspace, dashboard, approvals
- SSE for live chat execution

### 3. Runtime layer
- `backend/src/agents/runtime.ts`
- Builds system prompt from agent files, skills, memory, tools, and sandbox context
- Iterative loop: LLM → tool calls → tool execution → follow-up LLM
- Persists runs and tool invocations for auditability

### 4. Automation layer
- `backend/src/automations/`
- Stores scheduled agent instructions in SQLite
- Polls due automations on an interval
- Creates `automation_runs` records for each execution
- Runs automations through the agent runtime using the stored prompt

### 5. Skills layer
- Markdown skills with frontmatter
- Built-in and user-defined skills
- Skills are discoverable, readable, and reusable from agent prompts

### 6. Persistence layer
- SQLite as the source of truth
- Tables for users, sessions, agents, chats, messages, runs, tool invocations, automations, automation runs, skills, secrets, MCP servers, memory, audit, approvals, and web hooks/routes
- Runtime file data stored under `backend/data/`

## Execution flow

1. User configures an agent in the UI.
2. User sends a chat message or schedules an automation.
3. Runtime loads the agent state and builds the prompt.
4. LLM returns text and/or tool calls.
5. Tools run in the sandbox or against approved integrations.
6. Results are appended to the conversation and recorded in run history.
7. Automations are persisted with a corresponding execution record.

## Important constraints

- Keep agent execution sandboxed.
- Never let scheduler failures crash the server.
- Record every automation run in the database.
- Prefer additive module boundaries over monolithic logic.
- Keep UI and runtime decoupled through API contracts.

## Current hardening priorities

- Eliminate scheduler/runtime mismatches.
- Add explicit automation run lifecycle handling.
- Improve status visibility in the UI.
- Keep docs and routing maps current as new modules land.
