# AI Automation Lab → Zo Computer Clone: Gap Analysis

**Date:** 2026-06-27
**Goal:** Make ai-automation-lab an exact clone of Zo Computer

---

## Summary

The lab has ~70% feature parity with Zo. The biggest gaps are in **hosting primitives** (Space, Sites, Services), **chat channels** (Telegram, Discord, Slack, SMS, Email-in), **payment integration** (Stripe), **self-hosted site management** (zosite.json, publish flow), and **several UX pages that exist but are incomplete or diverge from Zo's design**.

---

## 1. Hosting & Web Serving (MAJOR GAP)

Zo Computer has 3 hosting primitives. The lab has partial equivalents.

| Zo Feature | Zo Description | Lab Status | Gap |
|---|---|---|---|
| **Zo Space** | Managed personal website with React pages + Hono API routes, zero setup, instantly live at `*.zo.space` | Lab has `webspace/` with CRUD for routes + runtime compilation, BUT it's agent-scoped (`/ws/<owner>/<path>`), not a user-facing site at `*.lab.space` | ❌ No public URL per user. No SPA serving for webspace routes. No asset management matching Zo's `update_space_asset` / `list_space_assets`. No route visibility per-page (public/private toggle in UI). |
| **Zo Sites** | Full projects with `zosite.json`, Vite+Bun+TypeScript+React+Tailwind+shadcn, dev server, publish flow, custom domains | ❌ Not present at all | Need: site scaffold (`create_website`), `zosite.json` schema, dev server lifecycle, `publish_site` / `unpublish_site`, backing user service, custom domain support. |
| **User Services** | Managed long-running processes (HTTP, TCP, process modes), public/private, auto-restart, custom domains | ❌ Not present | Need: `register_user_service`, `update_user_service`, `delete_user_service`, `service_doctor`, `proxy_local_service`. Supervisor that auto-starts and restarts. Service logs. |

### What's needed:
- [ ] **Space overhaul**: Make webspace serve as `*.lab.space` with proper SPA hosting, asset upload, page visibility, and route versioning
- [ ] **Sites system**: `create_website`, `publish_site`, `unpublish_site`, dev server management
- [ ] **Services system**: Register HTTP/TCP/process services, auto-restart, logs, custom domains
- [ ] **Asset management**: Upload/list/delete static assets for Space routes
- [ ] **Custom domains**: DNS routing for Sites and Services

---

## 2. Chat Channels (MAJOR GAP)

Zo supports multiple channels to talk to the AI. The lab only has in-app chat.

| Channel | Zo | Lab |
|---|---|---|
| **In-app chat** | ✅ SSE streaming | ✅ Has this |
| **Telegram** | ✅ Send/receive messages | ❌ |
| **Discord** | ✅ Send/receive messages | ❌ |
| **Slack** | ✅ Send/receive messages | ❌ |
| **SMS** | ✅ Send/receive via phone number | ❌ |
| **Email-in** | ✅ User emails `handle@zo.computer` → starts conversation | ❌ |
| **Email-out** | ✅ Agent can send emails via Gmail/Outlook | Partial — has Gmail/Outlook integration tools but no direct outbound email channel |

### What's needed:
- [ ] Telegram bot integration (webhook-based)
- [ ] Discord bot integration (gateway or webhook)
- [ ] Slack bot integration (Events API)
- [ ] SMS via Twilio or similar
- [ ] Email-in gateway (IMAP polling or SMTP listener)
- [ ] Channel routing layer in the agent runtime

---

## 3. Stripe / Payments (MAJOR GAP)

| Feature | Zo | Lab |
|---|---|---|
| **Stripe Connect** | ✅ Onboard, create products/prices/payment links | ❌ |
| **Product management** | ✅ `create_stripe_product`, `update_stripe_product` | ❌ |
| **Price management** | ✅ `create_stripe_price` | ❌ |
| **Payment links** | ✅ `create_stripe_payment_link`, `update_stripe_payment_link` | ❌ |
| **Order management** | ✅ `list_stripe_orders`, `update_stripe_orders` | ❌ |
| **Webhook handling** | ✅ Built-in route for Stripe webhook events | ❌ |
| **UI for payments** | ✅ Settings → Tools → Payments page | ❌ |

### What's needed:
- [ ] Stripe Connect onboarding flow
- [ ] Product/price/payment link CRUD API + UI
- [ ] Order listing + fulfilment status updates
- [ ] Webhook endpoint for `checkout.session.completed`, etc.
- [ ] Payments settings page

---

## 4. Zo / Ask API (MAJOR GAP)

Zo has a public API (`/zo/ask`) that lets external systems invoke the AI.

| Feature | Zo | Lab |
|---|---|---|
| **Ask API** | ✅ `POST /zo/ask` with model_name, stream, output_format | ❌ |
| **Access tokens** | ✅ Create/manage API tokens for external access | ❌ |
| **MCP-over-HTTP** | ✅ Connected MCP servers accessible via typed clients | ❌ |

### What's needed:
- [ ] `POST /api/ask` endpoint (spawn agent turn, return result)
- [ ] API key/token management (create, list, revoke)
- [ ] MCP gateway for external tool access

---

## 5. UI Pages — Missing or Incomplete

### Missing Pages (Zo has, Lab doesn't)

| Page | Zo Route | Description |
|---|---|---|
| **Sites** | `/sites` | List + manage published websites |
| **Services** | `/services` | List + manage running services |
| **Account/Billing** | `/account` | Plan, credits, usage, invoices |
| **Fan Club** | `/fans` | Community page |

### Existing Pages with Gaps

| Page | Current State | Zo Parity Gap |
|---|---|---|
| **Settings** | Has AI (personas, rules, agent config), Tools, Advanced tabs | Missing: Model selection UI (per-channel models), Provider management (BYOK keys), Channel setup (Telegram/Discord/Slack), Browser session management, Payments setup, Device management |
| **Dashboard** | Shows basic counts + 24h usage | Missing: Cost tracking, token breakdown by model, credit balance, billing overview |
| **Chat** | SSE streaming, message display, tool invocations | Missing: Chat feedback (has backend, need UI wiring), @-mentions, multi-agent handoff UI, chat export, chat sharing |
| **Agents** | List, create, clone, delete | Missing: Agent marketplace/gallery, agent sharing, agent templates (backend exists but no UI) |
| **Integrations** | Pipedream catalog + OAuth connect | Missing: Per-integration action execution UI, credential editing UI, connection health indicators |
| **MCP** | Server CRUD, connect/disconnect | Missing: MCP marketplace UI tab (backend exists), server health/status indicators, tool testing UI |
| **Secrets** | CRUD for encrypted secrets | Partial — need: secret reference counting, "used by" indicators, secret rotation |
| **WebSpace** | Route CRUD, code editing | Missing: Live preview, asset upload UI, route visibility toggle, route versioning UI |

---

## 6. Backend Features — Missing or Partial

### Completely Missing

| Feature | Description |
|---|---|
| **Supabase Auth → Self-hosted auth fallback** | Lab requires Supabase; Zo works standalone. Need local scrypt auth as fallback (code exists but is disabled). |
| **Time travel / Backups** | Zo has file-level snapshots and rollback. Lab has `agent_file_history` but no user-facing snapshot/restore UI for the whole workspace. |
| **Audit log UI** | Backend has `Audit.record()` and `/api/audit` endpoint, but no frontend page to browse it. |
| **Templates UI** | Backend has `templatesApi`, but no frontend page. |
| **Snapshots UI** | Backend has `snapshots/index.ts` and `/api/agents/:id/snapshots`, but no frontend page. |
| **Rate limiting UI** | Backend has rate limiting middleware, but no admin UI to view/adjust limits. |
| **Chat export** | No way to export a chat conversation. |
| **File sharing (zo.pub)** | Zo has `zopub` CLI for public file sharing. No equivalent. |
| **Agent workspace browsing** | Lab has `/files` page but it only browses agent sandboxes, not the user's full workspace. |
| **D2 diagram rendering** | Backend has tool, but no in-chat rendering of .d2 output. |

### Partial / Needs Expansion

| Feature | Current | Needed |
|---|---|---|
| **LLM Provider routing** | OpenAI-compatible + Anthropic header hack | Full Anthropic Messages API support (native, not OpenAI shim), Ollama native, Google Gemini native, streaming reasoning tokens |
| **Chat attachments** | Backend has `chat/attachments.ts` but no UI | File upload UI in chat, image/PDF/attachment display |
| **Webhook fire** | Backend exists, no UI | Webhook testing UI, delivery history |
| **MCP marketplace** | Backend has curated list | Community marketplace, install-one-click flow |
| **Integrations catalog** | Pipedream-powered | Need: direct action execution from UI, better category browsing |

---

## 7. Tools — Missing Zo-equivalent Tools

The lab has 55+ tools but several Zo-native tools have no lab equivalent:

| Zo Tool | Purpose | Lab Equivalent |
|---|---|---|
| `write_space_route` | Create/rewrite Space route | `manage_webspace` (partial) — no page/API type distinction, no public/private, no React rendering |
| `edit_space_route` | Edit existing Space route | ❌ No diff-based editing for webspace routes |
| `delete_space_route` | Delete route | ✅ `manage_webspace` delete action |
| `list_space_routes` | List routes | ✅ Partial |
| `update_space_asset` | Upload static assets | ❌ No asset management at all |
| `list_space_assets` | List assets | ❌ |
| `delete_space_asset` | Delete asset | ❌ |
| `create_website` | Scaffold a Zo Site | ❌ |
| `publish_site` | Publish a Site | ❌ |
| `unpublish_site` | Unpublish | ❌ |
| `register_user_service` | Start a managed service | ❌ |
| `update_user_service` | Update service config | ❌ |
| `delete_user_service` | Remove service | ❌ |
| `service_doctor` | Diagnose failing service | ❌ |
| `proxy_local_service` | Temp preview link | ❌ |
| `create_stripe_product` | Create payment product | ❌ |
| `create_stripe_price` | Create price | ❌ |
| `create_stripe_payment_link` | Gen payment link | ❌ |
| `list_stripe_orders` | View orders | ❌ |
| `create_persona` / `edit_persona` / `set_active_persona` | Persona CRUD | ✅ `manage_personas` equivalent exists (backend only, no agent tool) |
| `create_rule` / `edit_rule` / `delete_rule` | Rule CRUD | ✅ `manage_rules` equivalent exists (backend only, no agent tool) |
| `connect_integration` | OAuth connect button | ✅ `manage_integrations` connect action |
| `send_email_to_user` | Email the user directly | ❌ |
| `generate_d2_diagram` | D2 diagram gen | ✅ `lab_generate_d2_diagram` |
| `generate_image` | Image generation | ✅ `lab_generate_image` (Cloudflare) |
| `edit_image` | Image editing | ✅ `lab_edit_image` (Cloudflare) |
| `generate_video` | Video from image | ✅ `lab_generate_video` (ffmpeg) |
| `transcribe_audio` | Audio → text | ✅ `lab_transcribe_audio` |
| `transcribe_video` | Video → text | ✅ `lab_transcribe_video` |

---

## 8. Architecture & Infrastructure Gaps

| Area | Zo | Lab | Gap |
|---|---|---|---|
| **Hosting surface** | `*.zo.space` + `*.zocomputer.io` + `*.zo.computer` | Only Render app URL | Need custom domain routing, SSL, multi-tenant URL scheme |
| **Database** | Bun SQLite (local) + optional Postgres (Supabase) | Requires Postgres/Supabase | Need SQLite fallback for standalone mode |
| **Auth** | Local scrypt + JWT | Supabase-only | Need standalone auth mode (scrypt code exists but unused) |
| **File storage** | Local + 9p filesystem | Local + Postgres for metadata | Need proper workspace mount, time-travel snapshots |
| **Process supervisor** | Supervisord + auto-restart | No process management | Need service lifecycle manager |
| **Logging** | Loki-based log aggregation | Console only | Need structured logging, Loki integration, log viewer |
| **Email routing** | `handle@zo.computer` → chat | None | Need email gateway (IMAP/SMTP) |
| **Multi-tenancy** | Per-user isolation in DB + FS | Per-user in DB only | Need workspace isolation, sandbox hardening |

---

## 9. Priority Roadmap

### P0 — Core Differentiators (What makes Zo "Zo")

1. **Sites + Services system** — This is Zo's hosting story
2. **Chat channels** (Telegram, Discord at minimum)
3. **Self-hosted auth** (remove Supabase dependency)
4. **Space overhaul** (proper public URL per user, asset management)

### P1 — Feature Parity

5. Stripe payments integration
6. Ask API (external invocation)
7. Settings page completion (models, channels, browser sessions)
8. Sites/Services UI pages
9. Audit log UI
10. Chat attachments UI

### P2 — Polish & Completeness

11. Templates UI
12. Snapshots/restore UI
13. Webhook testing UI
14. File sharing (zo.pub equivalent)
15. Agent marketplace/gallery
16. Billing/usage UI
17. D2 diagram rendering in chat
18. MCP marketplace UI tab wiring
19. Integration execution UI
20. Custom domain management

---

## 10. Quick Wins (Can ship in a day each)

| # | Item | Effort |
|---|---|---|
| 1 | Wire audit log page (backend exists) | 2h |
| 2 | Wire templates page (backend exists) | 2h |
| 3 | Wire snapshots UI (backend exists) | 3h |
| 4 | Add `manage_personas` agent tool (backend store exists) | 1h |
| 5 | Add `manage_rules` agent tool (backend store exists) | 1h |
| 6 | Remove dead `zo_tools.ts` file | 5min |
| 7 | Enable scrypt auth fallback | 3h |
| 8 | Chat export (download as JSON/markdown) | 2h |
| 9 | Add asset upload to webspace | 4h |
| 10 | Webhook test-fire UI button | 2h |
