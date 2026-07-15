# **What is missing or materially weaker**

## **1. The workspace is not truly a personal computer**

Zo’s central abstraction is the user’s computer and files.

The lab’s file system is fragmented:

- Agent files live under agent-specific directories.
- Sandboxes live under `data/sandboxes`.
- Workspace browsing is rooted at the project path.
- Web Space files and site files use separate storage paths.
- User-generated output does not have one canonical personal workspace.

This means the user does not yet have one coherent filesystem that the AI, UI, terminal, browser downloads, sites, and services all share.

### **Required change**

Introduce a first-class workspace abstraction:

```markdown
/home/workspace/users/<user_id>/
├── Documents/
├── Projects/
├── Downloads/
├── Media/
├── Sites/
├── Services/
├── Skills/
├── Trash/
└── .zo/
    ├── snapshots/
    ├── metadata/
    └── indexes/
```

Every subsystem should resolve paths through a single `WorkspaceService`.

Do not let each feature invent its own root directory.

---

## **2. Browser support is not equivalent**

`frontend/src/pages/BrowserPage.tsx` is an iframe wrapper.

That is not a real browser session because:

- Many websites reject iframe embedding.
- It cannot reliably interact with cross-origin pages.
- It cannot maintain login profiles.
- It has no persistent cookies or storage.
- It has no authenticated browser-session list.
- It does not expose browser state to the agent.
- It does not provide robust screenshots, clicks, typing, scrolling, or downloads.

The lab tools can invoke `agent-browser`, but that is a command-line dependency, not a proper user-facing browser service.

### **Required change**

Build a `BrowserSessionService` with:

- Persistent browser profiles per user.
- Chromium context storage.
- Named sessions.
- Login persistence.
- Browser open/close/reset operations.
- Navigation.
- Click, fill, select, scroll, upload, download.
- Screenshots.
- Accessibility-tree extraction.
- Page text extraction.
- Session ownership enforcement.
- Download routing into the user workspace.

The browser page should control this service rather than directly embedding arbitrary URLs.

---

## **3. Permissions and approvals are not safe enough**

The tool registry supports:

```markdown
"always" | "ask" | "never"
```

However, the runtime only visibly enforces `"never"`. Tools marked `"ask"` are executed directly.

That is a critical mismatch with Zo’s safety model.

`approve_action`, `wait_for_approval`, and approval storage exist, but approval is not consistently inserted between tool selection and tool execution.

### **Required change**

The runtime must do this:

```markdown
LLM requests tool
        ↓
Resolve tool policy
        ↓
If never → deny
If always → execute
If ask → create approval → pause run
        ↓
User approves or rejects
        ↓
Resume or cancel run
```

The approval record needs:

- User ID.
- Run ID.
- Tool name.
- Arguments.
- Risk level.
- Expiration.
- Status.
- Approval timestamp.
- Reject reason.

Until this is implemented, the lab should not claim parity for safe computer control.

---

## **4. Sandbox isolation is weaker than Zo Computer**

`backend/src/sandbox/index.ts` says “sandbox”, but the default implementation is a local process and filesystem boundary.

The code itself acknowledges that Docker is only sketched.

Current limitations:

- No actual chroot.
- No container isolation by default.
- No enforced CPU limits.
- No enforced memory limits.
- Network policy is configuration, not comprehensive enforcement.
- Commands run as the application user.
- Local subprocesses may access more host capability than intended.
- Filesystem safety depends on path checks.

This is acceptable for a trusted development environment. It is not equivalent to an isolated personal computer executing arbitrary AI-generated commands.

### **Required change**

Use a real sandbox backend:

- Rootless containers or microVMs.
- Per-run or per-agent filesystem mounts.
- Explicit read/write mounts.
- Network namespace control.
- CPU and memory limits.
- Process count limits.
- Timeouts.
- Seccomp/AppArmor where available.
- Secret injection only for approved tools.
- No host environment inheritance.

Keep the local backend only for development.

---

## **5. The workspace API has path-safety weaknesses**

`backend/src/workspace/index.ts` uses prefix checks such as:

```markdown
resolved.startsWith(WORKSPACE_ROOT)
```

That is not sufficient. For example, a sibling path with the same prefix can pass a naïve check.

The resolver also does not consistently use realpath checks for existing symlinks.

### **Required change**

Use one safe resolver everywhere:

1. Resolve the requested path.
2. Resolve the workspace root with `realpath`.
3. Resolve the target with `realpath` when it exists.
4. For new files, resolve the nearest existing parent.
5. Require the target to equal the root or begin with `root + path separator`.
6. Reject symlinks that leave the workspace.
7. Never use plain string-prefix checks as the only boundary.

This should become a shared library, not duplicated per feature.

---

## **6. No unified trash and time travel**

The lab has:

- Agent file history.
- Agent snapshots.
- Restore operations.

That is useful, but it is not a computer-wide versioning system.

Missing:

- Workspace-wide snapshots.
- File-level time travel.
- Deleted-item restoration.
- Trash metadata.
- Snapshot labels.
- Diff browsing across the complete workspace.
- Restore safety preview.
- Automatic retention.

### **Required change**

Create a workspace journal:

```markdown
workspace_events
workspace_snapshots
workspace_snapshot_files
trash_entries
```

Every write, move, delete, and rename should create an event.

Then expose:

- “Restore this file”.
- “Restore this folder”.
- “Show what changed”.
- “Restore workspace to timestamp”.
- “Move to Trash”.
- “Restore from Trash”.

---

## **7. Channels are almost entirely absent**

This is the largest product-level gap.

Zo Computer is not only a web app. It can receive and send work through connected channels.

The lab has no equivalent for:

- Email conversations.
- Telegram conversations.
- SMS conversations.
- Discord conversations.
- Slack conversations.
- Per-channel model selection.
- Per-channel persona selection.
- Channel-specific automation delivery.
- Inbound webhook routing.
- Conversation continuation by channel.

### **Required architecture**

Create a channel adapter interface:

```markdown
interface ChannelAdapter {
  id: string;
  receive(event: unknown): Promise<InboundMessage[]>;
  send(message: OutboundMessage): Promise<void>;
  verifyWebhook(request: Request): Promise<boolean>;
}
```

Then implement:

- `web`
- `email`
- `telegram`
- `sms`
- `discord`
- `slack`

All channels should route into the same conversation engine:

```markdown
channel event
  → identity resolver
  → conversation resolver
  → agent/persona/model selection
  → runAgentTurn()
  → response renderer
  → channel adapter.send()
```

Without this, the lab remains a web-only agent dashboard.

---

## **8. Model and provider support is too generic**

The lab’s LLM layer is well-designed around OpenAI-compatible APIs, but Zo provides a broader provider model:

- Native AI subscription providers.
- BYOK providers.
- Custom OpenAI-style endpoints.
- Custom Anthropic-style endpoints.
- Model selection.
- Per-channel model selection.
- Persona model overrides.
- Provider connection status.
- Model discovery.

The lab currently mixes:

- Generic provider configuration.
- Environment variable fallback.
- User secrets.
- Mock providers.
- Some frontend provider assumptions.

### **Required change**

Create a first-class provider registry:

```markdown
providers
models
provider_credentials
channel_model_overrides
persona_model_overrides
```

Each provider should expose:

- Provider ID.
- Protocol.
- Base URL.
- Credential type.
- Model discovery.
- Health check.
- Streaming support.
- Tool-calling support.
- Reasoning support.
- Vision/audio support.

The LLM runtime should validate capabilities before sending a request.

---

## **9. Rules are only partially implemented**

The UI supports conditions, but the runtime currently injects only:

```markdown
- instruction
```

It does not evaluate the condition.

That means a rule intended to apply only in a specific context may be applied globally or not meaningfully enforced.

### **Required change**

Represent rules as executable policies:

```markdown
interface Rule {
  instruction: string;
  condition?: {
    channel?: string;
    route?: string;
    tool?: string;
    provider?: string;
    userMessage?: string;
  };
  priority: number;
  enabled: boolean;
}
```

Then evaluate rules at:

- Prompt construction.
- Tool selection.
- Tool execution.
- Channel delivery.
- Automation execution.

Rules should not be merely text appended to the system prompt.

---

## **10. Automations lack delivery and robust scheduling**

The scheduler has useful basics:

- Active/inactive state.
- RRULE-like intervals.
- Run history.
- Manual run.
- Last error.
- Next run.

But it lacks Zo-equivalent delivery:

- Email.
- SMS.
- Telegram.
- Discord.
- Slack.
- Webhook.
- In-app notification.

It also has weaknesses:

- UTC/server-oriented scheduling.
- No explicit user timezone.
- No distributed locking.
- No durable job queue.
- No retry policy.
- No concurrency policy.
- No missed-run policy.
- No model override per automation.
- No delivery result tracking.

### **Required data model**

```markdown
automation_deliveries
automation_runs
automation_locks
automation_retry_policy
user_timezones
```

An automation should contain:

```markdown
{
  schedule,
  timezone,
  agentId,
  model,
  instruction,
  deliveryMethod,
  deliveryTarget,
  retryPolicy,
  concurrencyPolicy
}
```

---

## **11. Foundry Connect migration is not yet complete**

The Pipedream replacement is present in `backend/src/integrations/foundry.ts`, and the integration UI has been adapted.

However, the migration still contains internal Pipedream terminology such as:

- `pdKey`
- `requiresPdKey`
- `PdApp`
- `PdComponent`
- `PipedreamClient` compatibility aliases

That is not inherently broken, but it is a sign the migration was mechanical rather than fully redesigned.

More importantly, the Foundry contract needs end-to-end tests for:

 1. Provider listing.
 2. Provider detail.
 3. Action listing.
 4. OAuth start.
 5. OAuth callback.
 6. Connection status.
 7. API-key connection.
 8. Action execution.
 9. Disconnect.
10. Webhook processing.

The lab should not claim integration parity until these flows are tested against the Railway deployment.

---

## **12. Sites and Services are only partial hosting equivalents**

The lab has the right conceptual pieces, but the implementation is less mature.

Weak areas include:

- Publishing via `bunx vite preview`.
- Process supervision through local subprocesses.
- Incomplete custom-domain handling.
- No strong production build isolation.
- No deployment rollback.
- No service health checks.
- No environment secret references.
- No persistent log-query API equivalent.
- No resource limits.
- No public/private access model with consistent enforcement.
- Placeholder generated site content.

`backend/src/sites/store.ts` contains generated templates, including a placeholder dashboard implementation. That is fine for scaffolding, but not parity.

---

## **13. API and external access are incomplete**

The lab has REST and SSE routes, but it lacks Zo’s broader external computer API model:

- Access-token creation and revocation.
- Scoped API tokens.
- External MCP access.
- Programmatic agent invocation.
- API usage limits per token.
- Webhook signing.
- OAuth client management.
- External tool invocation with audit trails.

### **Required change**

Create scoped access tokens:

```markdown
access_tokens
access_token_scopes
access_token_last_used
```

Example scopes:

```markdown
chat:write
chat:read
files:read
files:write
agents:run
automations:manage
sites:manage
services:manage
secrets:read-metadata
```

Never expose secret values through the API.