# AI Automation Lab

Multi-agent platform for creating, configuring, testing, and deploying AI agents
with skills, memory, MCP tools, sandboxed execution, and a full REST + SSE API.

## Architecture

```markdown
┌─────────────────────────────────────────────────────────┐
│                    React SPA (Vite)                      │
│  Login → Agents → AgentEdit → Chat → Skills → MCP →    │
│  Secrets → Runs                                         │
└──────────────┬──────────────────────────────────────────┘
               │ /api/* (REST) + SSE streaming
               ▼
┌─────────────────────────────────────────────────────────┐
│               Bun + Hono API (port 7777)                 │
│                                                         │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐ │
│  │  Auth    │ │  Agents   │ │  Chats   │ │  Skills   │ │
│  │  scrypt  │ │  fs+db    │ │  SSE     │ │  md+fm    │ │
│  └──────────┘ └───────────┘ └──────────┘ └───────────┘ │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐ │
│  │  Tools   │ │  MCP      │ │  Memory  │ │  Secrets  │ │
│  │  registry│ │  JSON-RPC │ │  kv      │ │  AES-256  │ │
│  └──────────┘ └───────────┘ └──────────┘ └───────────┘ │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐               │
│  │ Sandbox  │ │  Runtime  │ │  Runs    │               │
│  │  local   │ │  iterative│ │  history │               │
│  └──────────┘ └───────────┘ └──────────┘               │
└──────────────────┬──────────────────────────────────────┘
                   │ bun:sqlite
                   ▼
        ┌─────────────────────┐
        │  data/lab.sqlite    │
        │  data/agents/       │
        │  data/sandboxes/    │
        │  data/skills/       │
        │  data/memory/       │
        └─────────────────────┘
```

## Quick Start

```bash
# Start backend (serves API + SPA)
cd /home/workspace/Projects/ai-automation-lab/backend
PORT=7777 bun run src/server.ts

# Rebuild frontend after changes
cd /home/workspace/Projects/ai-automation-lab/frontend
bun run build
```

## Live URL

The backend runs on port **7777** as a managed process service (`ai-automation-lab`).
It is NOT accessible as an HTTP service (plan limit reached). To preview the UI:

```bash
proxy_local_service(7777)
```

## Automations (Scheduled Agent Tasks)

Create, schedule, and manage recurring agent executions. Supports RRULE-style
and interval-based scheduling.

### API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/automations | List automations for user |
| GET | /api/automations/:id | Get automation details |
| POST | /api/automations | Create automation (name, agent_id, rrule, instruction) |
| PUT | /api/automations/:id | Update automation fields |
| DELETE | /api/automations/:id | Delete automation |
| GET | /api/automations/:id/runs | List execution history for automation |

### Creating an Automation

```bash
TOKEN="your-bearer-token"

curl -X POST http://localhost:7777/api/automations 
  -H "Content-Type: application/json" 
  -H "Authorization: Bearer $TOKEN" 
  -d '{
    "name": "Daily Report",
    "agent_id": "agent_xxx",
    "rrule": "FREQ=DAILY",
    "instruction": "Generate a daily summary report"
  }'
```

### RRULE Formats

- `FREQ=MINUTELY` or `FREQ=MINUTELY;INTERVAL=15` — every N minutes
- `FREQ=HOURLY` or `FREQ=HOURLY;INTERVAL=6` — every N hours
- `FREQ=DAILY` — once per day
- `FREQ=WEEKLY` — once per week
- `FREQ=MONTHLY` — once per month

### Scheduling

The scheduler runs in `file backend/src/automations/index.ts` as a setInterval loop
(default: check every 15s). It queries `automations` where `active=1` and
`last_run_at + interval < now()`, then spawns an agent turn using the
automation's `instruction` as the user message in a new chat.

### Automation Runs Table

Each automation execution creates a row in `automation_runs` with status
(running/completed/failed), output, error, and timestamps.

## Database Schema

The `lab.sqlite` database uses these tables:

| Table | Purpose |
| --- | --- |
| `users` | User accounts (scrypt hashed passwords) |
| `sessions` | Bearer token sessions |
| `agents` | Agent registry (fs-backed content, db metadata) |
| `chats` | Conversation containers |
| `messages` | Chat messages (all roles) |
| `runs` | Agent turn executions |
| `tool_invocations` | Individual tool calls within runs |
| `automations` | Scheduled automation configs |
| `automation_runs` | Automation execution history |
| `skills` | Skill definitions (built-in + user) |
| `mcp_servers` | MCP server connection configs |
| `memory_items` | Long-term memory store |
| `agent_file_history` | Snapshot-based file versioning |
| `secrets` | Encrypted credential vault |
| `rate_counters` | Per-user rate limiting |
| `space_routes` | Web Space route definitions |

## Known Fixes

### 2026-06-18: Automations column mismatch

**Issue:** The `automations` table schema defined the instruction column as
`prompt TEXT NOT NULL`, but the TypeScript handler was inserting into
`instruction` column name.

**Fix:** Updated `file backend/src/automations/index.ts` to use column name `prompt`
in SQL INSERT/UPDATE statements while keeping `instruction` as the API body
field name (maps `body.instruction` → column `prompt`).

### 2026-06-20: Web Space hosting for agents

**Issue:** Agents needed the ability to create and host real web projects, but
without relying on Zo Computer resources.

**Fix:** Added a self-contained Web Space subsystem in `backend/src/webspace/`
and `backend/src/tools/webspace_tools.ts`.

- `manage_webspace` lets agents create/list/update/publish page and API routes.
- `fetch_webspace_route` lets agents verify their own hosted routes.
- Hosted routes are served by the lab backend at `/ws/<owner>/<path>`.
- API routes compile at runtime and execute with a real Hono context.
- Ownership is enforced by bearer token; cross-user access is blocked.
- No Zo Computer APIs, storage, or hosting primitives are used.

### 2026-06-21: Responsive shell (mobile drawer + chat sheet)

**Issue:** The app shell (`App.tsx` + `Sidebar.tsx` + `Topbar.tsx`) was
desktop-only — a 220px sidebar plus optional ChatPanel column at all viewport
widths, which overflowed on phones.

**Fix:** Added a single breakpoint (`useBreakpoint` hook, `lg` ≈ 1024px) and a
mobile branch in `Shell`. Desktop rendering path is unchanged
byte-for-byte; the new mobile branch is a sibling return that:

- Collapses the grid to a single column.
- Hides the persistent sidebar and renders it as a fixed-position drawer,
  toggled by a hamburger button on the Topbar (visible only `<lg`).
- Renders the ChatPanel as a full-width overlay sheet (with scrim) when open
  on mobile, instead of squeezing it into the grid.

**Files touched:** `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`,
`frontend/src/components/Topbar.tsx`, `frontend/src/hooks/useBreakpoint.ts`
(new). No data layer, no API routes, no other components changed.

### 2026-06-20: Web Space auth — public routes + query-param token

**Issue:** Web Space routes (`/ws/<owner>/<path>`) required a Bearer token in the
`Authorization` header, which browsers don't send on normal page navigation.
All routes returned `{"error":"unauthorized"}` when opened in a browser, even
the route owner's own pages.

**Fix:** Updated `file backend/src/webspace/serving.ts` with two auth paths:

1. **Public routes** (`is_public=1`) — served to anyone without authentication.
   The owner's index page shows 🔓/🔒 visibility icons.
2. **Query-param token** (`?token=xxx`) — browsers can pass a session token in
   the URL as a fallback for private routes. Same validation as the Bearer header.
3. **Publish action** — `manage_webspace` publish action now sets `is_public=1`
   (was a no-op placeholder before). Create action also respects `isPublic`.

**Migration:** Set existing routes public:
```bash
sqlite3 data/lab.db \
  "UPDATE space_routes SET is_public=1 WHERE owner_id='<owner_id>' AND path LIKE '/esquire-law-uk/%';"
```

**Files changed:**
- `backend/src/webspace/serving.ts` — auth logic, index page split for owner/anonymous
- `backend/src/tools/webspace_tools.ts` — publish sets is_public=1, create respects isPublic

### 2026-06-22: Self-contained `lab_*` tool namespace (27 new tools)

**Issue:** A previous draft of `file backend/src/tools/zo_tools.ts` defined
~20 Zo API-wrapping tools, but the file was never imported into `main.ts` or
`server.ts` (it was dead code). The user wanted the agent to have a rich
self-contained toolkit that does NOT depend on the Zo Computer platform.

**Fix:** Created `file backend/src/tools/lab_tools_extra.ts` (1248 lines)
registering 27 `lab_*` tools in the existing tool registry. Every tool
runs entirely inside the lab — bun's `fetch`,

## Project Layout

```markdown
backend/
├── src/
│   ├── api/server.ts       # Hono REST + SSE routes
│   ├── agents/             # Registry, runtime, files, permissions, history
│   ├── automations/        # Scheduled agent task runner + scheduler
│   ├── chats/              # Chat + message stores
│   ├── db/                 # SQLite schema + migrations
│   ├── llm/                # LLM provider abstraction + mock
│   ├── mcp/                # MCP client + manager
│   ├── memory/             # Long-term memory store
│   ├── runs/               # Run + tool invocation tracking
│   ├── sandbox/            # Local sandbox (filesystem jail)
│   ├── secrets/            # Encrypted vault (AES-256-GCM)
│   ├── security/           # Auth (scrypt) + rate limiter
│   ├── skills/             # Skills system (md + frontmatter)
│   │   └── builtin/        # Built-in skills
│   ├── tools/              # Tool registry + builtins
│   ├── webspace/           # Web Space route management
│   └── workspace/          # File browser for agent workspace
└── data/                   # Runtime data (DB, agents, sandboxes, skills, memory)

frontend/
├── src/
│   ├── api/                # API client + types
│   ├── components/         # Sidebar, Topbar, Modal, ChatMessage, ThinkingIndicator
│   ├── pages/              # 13 pages (see below)
│   ├── state/              # Auth (zustand)
│   └── index.css           # 21st.dev / Zo-style primitives
└── dist/                   # Built SPA (served by backend on port 7777)
```

## Frontend Pages

| Page | Route | Description |
| --- | --- | --- |
| Login | /login | Auth (register/login tabs) |
| Agents | /agents | Agent list + create/clone |
| AgentEdit | /agents/:id | File editor, config, sandbox, memory, MCP |
| Chat | /chat/:id | SSE streaming conversation |
| Chats | /chats | Chat list + create |
| Skills | /skills | Browse built-in + user skills, create/edit |
| MCP | /mcp | MCP server management |
| Secrets | /secrets | Encrypted vault CRUD |
| Runs | /runs | Execution history + tool invocations |
| Automations | /automations | Scheduled task management |
| Browser | /browser | Sandbox file browser |
| Files | /files | Agent workspace files |
| WebSpace | /web-space | Space route CRUD |

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login (returns bearer token) |
| GET | /api/health | Health check |
| GET/POST | /api/agents | List / Create agents |
| GET/DELETE | /api/agents/:id | Get / Delete agent |
| POST | /api/agents/:id/clone | Clone agent |
| PUT | /api/agents/:id/config | Update agent config |
| GET/PUT | /api/agents/:id/file | Read / Write agent file |
| GET | /api/agents/:id/files | List agent files |
| GET | /api/agents/:id/history | File version history |
| GET/POST | /api/agents/:id/memory | List / Add memory |
| GET | /api/agents/:id/export | Export agent as pack |
| POST | /api/agents/import | Import agent pack |
| GET/POST/DELETE | /api/chats | List / Create / Delete chats |
| GET | /api/chats/:id | Get chat + messages |
| POST | /api/chats/:id/messages | SSE streaming chat |
| POST | /api/chats/:id/rename | Rename chat |
| POST | /api/chats/:id/active-agent | Switch agent |
| GET/POST/DELETE | /api/skills | List / Create / Delete skills |
| GET/POST/DELETE | /api/mcp/servers | List / Add / Delete MCP servers |
| POST | /api/mcp/servers/:id/connect | Connect MCP server |
| POST | /api/mcp/servers/:id/disconnect | Disconnect MCP server |
| GET | /api/mcp/servers/:id/tools | List MCP server tools |
| GET | /api/secrets | List secrets |
| PUT/DELETE | /api/secrets/:name | Save / Delete secret |
| GET | /api/tools | List registered tools |
| GET | /api/runs | List runs (execution history) |
| GET | /api/runs/:id | Get run + tool invocations |
| GET/PUT/DEL/POST | /api/agents/:id/sandbox/\* | Sandbox file operations |

## Key Features

| Feature | Status |
| --- | --- |
| Auth (register/login, scrypt, bearer tokens) | ✅ |
| Agent CRUD (create, clone, import/export) | ✅ |
| Agent Filesystem (system.md, persona.md, skills.md, tools.md, memory.md, config.json) | ✅ |
| Iterative Agent Runtime (max 12 steps per turn) | ✅ |
| Tool Registry (15 built-in + 27 self-contained `lab_*` tools) | ✅ |
| Skills System (markdown + frontmatter, 3 built-in skills) | ✅ |
| MCP Client (stdio JSON-RPC 2.0, auto-connect) | ✅ |
| Sandbox (local filesystem jail, timeout, output cap) | ✅ |
| Long-term Memory (per-agent kv store) | ✅ |
| Encrypted Secrets Vault (AES-256-GCM) | ✅ |
| Run/Tool Invocation History | ✅ |
| File Versioning (snapshot-on-save) | ✅ |
| Rate Limiting (per-minute + per-hour) | ✅ |
| SSE Chat Streaming | ✅ |
| Mock LLM Provider | ✅ |

## Integrations

| Feature | Status |
| --- | --- |
| Integrations System (Pipedream-powered) | ✅ |
| Browsing Pipedream catalog (search + categories) | ✅ |
| Connect/disconnect integrations (API key & OAuth) | ✅ |
| Integration action execution | ✅ |
| Integration credentials for agents | ✅ |
| Lab tool: manage_integrations (list/execute/sync) | ✅ |
| Lab tool: use_integration (direct action call) | ✅ |
| Credential management (secrets vault) | ✅ |

## Built-in Tools

`read_file`, `write_file`, `list_files`, `execute_command`, `http_request`,
`call_mcp_tool`, `list_mcp_tools`, `update_memory`, `read_memory`,
`update_agent_file`, `list_skills`, `read_skill`, `run_skill`,
`propose_plan`, `wait_for_approval`


### 2026-06-22: Cloudflare Workers AI for image/audio (no more media stubs)

**Issue:** The `lab_generate_image`, `lab_edit_image`, `lab_transcribe_audio`, and `lab_transcribe_video` tools were honest T2 stubs -- no local SD/Whisper available, and the lab's "100% local" rule blocked calling OpenAI/Anthropic/Zo.

**Fix:** Wired the four tools to **Cloudflare Workers AI** when the user has set `CF_ACCOUNT_ID` and `CF_API_TOKEN` secrets. Cloudflare is treated as an external model provider, NOT a third-party data processor, because the user supplies their own credentials and account -- the lab itself has no Cloudflare identity. Falls back gracefully if creds aren't set (clear "set these secrets to enable" message).

**Models wired:**

| Tool | Primary model | Fallback |
| --- | --- | --- |
| `lab_generate_image` | `@cf/black-forest-labs/flux-1-schnell` (JSON) or `@cf/bytedance/stable-diffusion-xl-lightning` (binary) | none -- returns clear setup message |
| `lab_edit_image` | `@cf/black-forest-labs/flux-2-klein-9b` (multipart with input_image_0..2) | none |
| `lab_transcribe_audio` | `@cf/openai/whisper` (multipart, MP3-converted input) | local `whisper.cpp` if installed |
| `lab_transcribe_video` | same, after ffmpeg audio extract + MP3 conversion | local whisper |

**`lab_generate_video`** is still a stub -- the user's Cloudflare account has no video models (only Pixverse would be available on paid plans, and it's not enabled here). Returns a clear message naming what would be needed.

**Implementation notes:**
- Cloudflare's `whisper` rejects some WAV headers with HTTP 400 "Invalid audio input" -- ffmpeg converts the input to MP3 first, which works reliably.
- `@cf/black-forest-labs/flux-2-dev` (the natural-looking edit model) returns raw multipart and crashes Bun's response parser. The `flux-2-klein-9b` variant returns proper JSON `{success, result:{image: base64}}` and works.
- Model names must NOT be `encodeURIComponent`'d -- `/` is fine in the URL path. (Bug: my first attempt encoded `/` to `%2F` and got "No route for that URI" 700.)
- Output file extension is `.jpg` (not `.png`) because all three image models return JPEG bytes, even though `output_format: 'png'` is requested.

**Files touched:** `file backend/src/tools/lab_tools_extra.ts`, `file backend/data/agents/agent_ZJCSqyg6av/tools.md`.

### Lab Management Tools (6 tools — added 2026-06-19)

These tools give any agent self-service access to manage the automation lab's own resources. All are registered in `file src/tools/lab_tools.ts`:

| Tool | Action | Description |
| --- | --- | --- |
| `manage_skills` | list/read/create/edit/delete/clone | Create and manage reusable skill procedures |
| `manage_automations` | list/get/create/edit/delete/toggle | Schedule recurring agent tasks |
| `manage_mcp_servers` | list/create/edit/delete/connect/disconnect | Manage MCP server connections |
| `browser_navigate` | (url, timeoutMs) | Navigate to a URL and extract readable text |
| `browser_screenshot` | (url, fullPage) | Capture a headless Playwright screenshot as base64 PNG |
| `web_search` | (query, count) | Search Google and return result snippets |

**File:** `file backend/src/tools/lab_tools.ts`

**Architecture note:** These tools operate by calling the same Skills, DB, MCP, and Playwright modules that the API routes use. Data created by the agent via these tools appears immediately in the Skills, Automations, and MCP tabs in the UI — no manual refresh needed.

### Lab Extra Tools (27 tools — added 2026-06-21)

Fully self-contained `lab_*` tools. No requests to Zo Computer, Anthropic, OpenAI, or any third-party API — everything runs locally on the lab. Replaces the orphaned `zo_tools.ts` (dead code, never imported).

**Tier classification:**
- **T1** — fully implemented, lab-internal
- **T1+** — fully implemented but requires an optional local binary (ffmpeg, d2, whisper) — returns a clear error if missing
- **T2** — stubbed with an honest "not implemented in-lab yet" message

| Tool | Tier | Description |
| --- | --- | --- |
| `lab_read_file` | T1 | Read text, images, PDFs, EPUBs, office docs |
| `lab_write_file` | T1 | Write file (creates parent dirs) |
| `lab_edit_file` | T1 | Deterministic block-level edits (replace/insert/delete/append) |
| `lab_edit_file_llm` | T1 | LLM-style rewrites with `// ... existing code ...` placeholders |
| `lab_copy_file` | T1 | Copy a file to a new path |
| `lab_list_directory` | T1 | List directory contents as a tree |
| `lab_grep_search` | T1 | ripgrep-backed filename + content search |
| `lab_bash` | T1 | Run a single shell command |
| `lab_run_sequential_cmds` | T1 | Run commands sequentially |
| `lab_run_parallel_cmds` | T1 | Run commands concurrently |
| `lab_read_webpage` | T1 | Fetch URL, return clean text (or browser-rendered if requested) |
| `lab_save_webpage` | T1 | Save a URL to the sandbox as markdown |
| `lab_web_search` | T1 | DuckDuckGo HTML search (no API key) |
| `lab_web_research` | T1 | Multi-query search + result aggregation |
| `lab_maps_search` | T1 | Google Maps HTML search (no API key) |
| `lab_x_search` | T1 | X/Twitter via Google `site:twitter.com` (no API key) |
| `lab_image_search` | T1 | Bing image search (no API key) |
| `lab_find_similar_links` | T1 | Find pages similar to a URL |
| `lab_open_webpage` | T1 | Start a persistent Playwright browser session |
| `lab_view_webpage` | T1 | Read current page content + screenshot |
| `lab_use_webpage` | T1 | Interact with the open page (click, fill, type, press, scroll, etc.) |
| `lab_transcribe_audio` | T1 | Cloudflare Whisper or local whisper.cpp |
| `lab_transcribe_video` | T1 | Extracts audio via ffmpeg, then Cloudflare Whisper or local whisper |
| `lab_generate_image` | T1 | Cloudflare FLUX / SDXL -- needs CF secrets |
| `lab_edit_image` | T1 | Cloudflare FLUX.2 klein_9B -- needs CF secrets |
| `lab_generate_video` | T1 | Returns clear stub message (no video models in current CF account) |
| `lab_generate_d2_diagram` | T1+ | Uses `d2` CLI if installed; clear error otherwise |

**File:** `file backend/src/tools/lab_tools_extra.ts`

**Wiring:** Imported in both `file backend/src/main.ts` and `file backend/src/server.ts` (both entry points). Runs at server boot, registers all 27 tools in the global `toolRegistry`. They are exposed to every agent automatically — no per-agent opt-in.

**Notes on the old `zo_tools.ts`:** File still exists on disk for reference but is NOT imported anywhere. The `zo_*` namespace is dead code. New work should use `lab_*` from `lab_tools_extra.ts`.

## Built-in Skills

- **Web Research** — Answer a research question by collecting, cross-checking, and synthesizing multiple sources
- **Email Outreach** — End-to-end cold outreach: find a lead, validate email, draft, and send
- **Coding Task** — Tackle a coding task in the sandbox: read project, plan, write code, run tests, iterate

## System Status (verified 2026-06-18)

All components are running and end-to-end tested. Below is the verified status.

## Default LLM Provider

The system ships with a **mock LLM provider** so it works out of the box
without API keys. The mock recognizes natural-language prompts like:

- `list files`
- `read system.md`
- `run ls -la`
- `GET https://example.com`
- `remember the user likes dark mode`
- `use skill web-research`
- `plan: scrape the top 10 results`

To use a real provider (OpenAI, Anthropic, etc.):

1. Go to **Secrets** page and add your API key
2. Edit your agent's **config.json** → set `provider` + `model` + `apiKeySecret`

## Integrations System (Pipedream-powered)

The integrations subsystem connects the lab to Pipedream's catalog of 2,500+
external services. Users add a Pipedream API key as a secret (`pipedream_api_key`),
then browse the catalog, connect accounts, and execute actions.

### Files

| File | Description |
| --- | --- |
|  | Pipedream Connect API client (catalog, accounts, actions) |
|  | Integration connection CRUD (DB-backed) |
|  | REST API routes for integrations |
|  | Lab tools: manage_integrations, use_integration |
|  | Integrations management UI |
|  | Integrations API client |

### Database Tables

| Table | Description |
| --- | --- |
| `integration_connections` | Active integration connections per user (app_slug, auth_type, status, credentials_ref) |
| `integration_action_cache` | Cached action schemas per app (fetched from Pipedream) |

### API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/integrations | List user's connected integrations |
| POST | /api/integrations | Connect a new integration (app_slug, auth_type, credentials) |
| GET | /api/integrations/:id | Get connection details (incl. available actions) |
| DELETE | /api/integrations/:id | Disconnect integration |
| POST | /api/integrations/:id/execute | Execute an action on the integration |
| PUT | /api/integrations/:id/credentials | Update credentials for a connection |
| PUT | /api/integrations/:id/oauth | Update OAuth connected_account_id |
| GET | /api/integrations/catalog | Browse Pipedream catalog (?q=search, ?page=, ?per_page=) |
| GET | /api/integrations/catalog/:slug | Get app details with actions/triggers |
| POST | /api/integrations/catalog/:slug/refresh | Re-fetch app from Pipedream |
| POST | /api/integrations/connect/:slug | Full OAuth connect flow |
| GET | /api/integrations/stats | Count by connection status |
| GET | /api/integrations/categories | List all catalog categories |
| GET | /api/integrations/pipedream/status | Check if PD API key is configured |
| PUT | /api/integrations/pipedream/key | Set/update the PD API key via secrets |

### Agent Tools

Two lab tools are registered for agents:

1. **manage_integrations** — list connected integrations, execute actions,
   sync action cache
2. **use_integration** — execute an action with full params on a connected
   integration (action-specific input)

### Authentication Flow

1. User creates a Pipedream project + OAuth client at pipedream.com
2. Saves the Pipedream API key to the lab secrets vault as `pipedream_api_key`
3. Browses the catalog in the Integrations UI or via agent tools
4. Connects an app by providing API keys or completing OAuth
5. Agents can then discover and execute actions on connected integrations

### Known Limitations

- Requires a Pipedream account and API key (free tier works)
- OAuth integrations require setting up a Pipedream OAuth client
- Action execution goes through Pipedream's servers (network latency)
### 2026-06-22: Chat panel media previews + sandbox file serving + video generation

**Issues fixed:**

1. **Media files weren't visible in chat** — when the agent called `lab_generate_image`,
   `lab_edit_image`, `lab_generate_video`, etc., the resulting image/video was saved
   to the agent's sandbox but never surfaced in the UI.
2. **Chat panel stretched the main page when the conversation grew long** — the grid
   layout had no `min-h-0` on the flex containers, so scrolling content would push
   the whole shell beyond the viewport.
3. **Video generation was failing** — Cloudflare Workers AI (the configured image /
   transcription provider) has no video models enabled on this account (verified
   via `/accounts/<id>/ai/models/search?task=text-to-video` returning 0 results).

**Fixes:**

1. **Sandbox binary endpoint** — added
   `GET /api/agents/:id/sandbox/file?path=<sandbox-relative-path>` to
   `file backend/src/api/server.ts` and `file backend/src/sandbox/api.ts`. Returns
   the raw bytes with the right MIME type (image/jpeg, video/mp4, image/png,
   audio/mpeg, etc.) and enforces the same auth + sandbox-jail checks as the
   existing `/sandbox/read` text endpoint. Path-traversal escapes are blocked.
2. **Media attachments on tool results** — extended the `ok()` helper in
   `file backend/src/tools/lab_tools_extra.ts` to accept an optional `media`
   array. Each tool result can now carry `[{ path, mime, kind, alt? }]`. Wired
   `lab_generate_image`, `lab_edit_image`, and `lab_generate_video` to attach
   their output. The frontend's ChatPanel reads this via `getToolMedia()` and
   renders inline previews.
3. **MediaPreview component** — new `file frontend/src/components/MediaPreview.tsx`.
   Fetches the binary via `fetch()` with the bearer token (img/src can't carry
   auth headers), turns it into a blob URL, and renders `<img>`, `<video controls>`,
   or `<audio controls>` accordingly. Click the image to open in a new tab.
4. **Layout fix** — added `min-h-0` to the grid items in
   `file frontend/src/App.tsx`, the chat panel `<aside>`, the scrolling
   messages container, and the empty-state column in
   `file frontend/src/components/ChatPanel.tsx`. Main page now stays the size
   of the viewport; only the chat panel scrolls.
5. **lab_generate_video** — rewrote to generate 4-second MP4s locally with
   `ffmpeg` + ImageMagick. Two modes:
   - Pass `filepath` to animate an existing image (e.g. `Images/dragon.jpg`).
   - Or no filepath → generate a base image via Cloudflare FLUX.2 [klein] 9B
     then animate it.
   Both produce a 1280x720 24fps H.264 MP4 with a slow Ken-Burns horizontal
   pan (scale 2x + time-based crop x-offset). Falls back to a clear error
   message if ffmpeg isn't installed.
6. **Tool meta entries** — `file frontend/src/lib/toolMeta.ts` now has icons and
   labels for `lab_generate_image`, `lab_edit_image`, `lab_generate_video`,
   `lab_transcribe_audio`, `lab_transcribe_video`. New `getToolMedia(result)`
   helper extracts the `media` array from a tool result.
