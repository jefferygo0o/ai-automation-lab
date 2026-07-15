import { api } from "./client";

// ---- New types for Web Space, Workspace, Automations, Browser ----

export interface SpaceRoute {
  id: string;
  path: string;
  type: "page" | "api";
  code: string;
  public: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
}

export interface WorkspaceReadResult {
  path: string;
  content: string;
  encoding: string;
}

export interface Automation {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  agentId: string | null;
  instruction: string;
  rrule: string;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
  output: string | null;
  error: string | null;
  createdAt: number;
}

export interface Auth { token: string; userId: string; expiresAt: number; }
export interface Agent { id: string; ownerId: string; name: string; description: string; createdAt: number; updatedAt: number; hash: string; runtime: string; }
export interface AgentConfig {
  provider: string; baseUrl: string; apiKeySecret: string | null; model: string;
  temperature?: number; maxTokens?: number;
  sandbox: { backend: string; workdir: string; timeoutMs: number; memoryMb: number; cpus: number; network: string; allowHosts: string[]; };
  permissions: Record<string, string>;
  mcpServers: Array<{ name: string; command: string; args: string[]; env?: Record<string, string> }>;
}
export interface FileEntry { name: string; size: number; mtime: number; }
export interface MemoryItem { id: string; agentId: string; ownerUserId: string; kind: string; key: string; value: string; source: string; createdAt: number; updatedAt: number; }
export interface Chat { id: string; agentId: string; ownerId: string; title: string; activeAgentId: string | null; createdAt: number; updatedAt: number; }
export interface Message { id: string; chatId: string; role: string; content: string; toolCalls?: any; toolCallId?: string; name?: string; runId?: string; createdAt: number; }
export interface Run { id: string; chatId: string; userId: string; agentId: string; status: string; startedAt: number; finishedAt: number | null; promptTokens: number; completionTokens: number; totalTokens: number; costCents: number; errorMessage?: string | null; agentHash: string; agentRuntime: string; }
export interface ToolInvocation { id: string; runId: string; toolName: string; arguments: any; result: any; status: string; error: string | null; startedAt: number; finishedAt: number | null; durationMs: number; sandboxId: string | null; }
export interface Skill { id: string; name: string; description: string; body: string; source: string; filename: string; updatedAt: number; inputs?: Array<{ name: string; description: string; type?: string; required?: boolean; default?: any }>; mcp_required?: string[]; }
export interface McpServer { id: string; name: string; command: string; args: string[]; env?: Record<string, string>; enabled: boolean; connected: boolean; }
export interface SecretMeta { id: string; ownerId: string; name: string; createdAt: number; }
export interface SandboxEntry { name: string; path: string; type: string; size: number; mtime: number; }
export interface SandboxExecResult { ok: boolean; exitCode: number | null; signal: string | null; stdout: string; stderr: string; durationMs: number; truncated: boolean; }
export interface McpTool { name: string; description?: string; inputSchema?: any; }

export const Auth = {
  register: (email: string, password: string) =>
    api<{ user: { id: string; email: string } }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    api<Auth>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
};

export const Agents = {
  list: () => api<{ agents: Agent[] }>("/api/agents"),
  create: (name: string, description = "") =>
    api<{ agent: Agent }>("/api/agents", { method: "POST", body: JSON.stringify({ name, description }) }),
  get: (id: string) => api<{ agent: Agent; config: AgentConfig }>(`/api/agents/${id}`),
  updateConfig: (id: string, config: Partial<AgentConfig>) =>
    api<{ ok: boolean }>(`/api/agents/${id}/config`, { method: "PUT", body: JSON.stringify(config) }),
  delete: (id: string) => api<{ ok: boolean }>(`/api/agents/${id}`, { method: "DELETE" }),
  remove: (id: string) => api<{ ok: boolean }>(`/api/agents/${id}`, { method: "DELETE" }),
  clone: (id: string, name?: string) =>
    api<{ agent: Agent }>(`/api/agents/${id}/clone`, { method: "POST", body: JSON.stringify({ name }) }),
  exportPack: (id: string) => api<any>(`/api/agents/${id}/export`),
  importPack: (pack: any) =>
    api<{ agent: Agent }>("/api/agents/import", { method: "POST", body: JSON.stringify(pack) }),
  files: (id: string) => api<{ files: FileEntry[] }>(`/api/agents/${id}/files`),
  listFiles: (id: string) => api<{ files: FileEntry[] }>(`/api/agents/${id}/files`),
  readFile: (id: string, name: string) =>
    api<{ content: string }>(`/api/agents/${id}/file?name=${encodeURIComponent(name)}`),
  writeFile: (id: string, name: string, content: string) =>
    api<{ ok: boolean }>(`/api/agents/${id}/file?name=${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ content }) }),
  history: (id: string, file?: string) =>
    api<{ history: any[] }>(`/api/agents/${id}/history${file ? `?file=${encodeURIComponent(file)}` : ""}`),
  revert: (id: string, versionId: string) =>
    api<{ ok: boolean }>(`/api/agents/${id}/history/${versionId}/revert`, { method: "POST" }),
  revertHistory: (id: string, versionId: string) =>
    api<{ ok: boolean }>(`/api/agents/${id}/history/${versionId}/revert`, { method: "POST" }),
  sandboxBrowse: (id: string, path: string) =>
    api<{ path: string; entries: SandboxEntry[] }>(`/api/agents/${id}/sandbox?path=${encodeURIComponent(path)}`),
  sandboxRead: (id: string, path: string) =>
    api<{ path: string; content: string }>(`/api/agents/${id}/sandbox/read?path=${encodeURIComponent(path)}`),
  sandboxWrite: (id: string, path: string, content: string) =>
    api<{ ok: boolean }>(`/api/agents/${id}/sandbox/write`, { method: "PUT", body: JSON.stringify({ path, content }) }),
  sandboxDelete: (id: string, path: string) =>
    api<{ ok: boolean }>(`/api/agents/${id}/sandbox?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
  sandboxExec: (id: string, command: string, args: string[] = [], timeoutMs?: number) =>
    api<SandboxExecResult>(`/api/agents/${id}/sandbox/exec`, { method: "POST", body: JSON.stringify({ command, args, timeoutMs }) }),
};

export const Memory = {
  list: (agentId: string, kind?: string) =>
    api<{ items: MemoryItem[] }>(`/api/agents/${agentId}/memory${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`),
  add: (agentId: string, kind: string, key: string, value: string, source = "user") =>
    api<{ id: string }>(`/api/agents/${agentId}/memory`, { method: "POST", body: JSON.stringify({ kind, key, value, source }) }),
  upsert: (agentId: string, kind: string, key: string, value: string, source = "user") =>
    api<{ id: string }>(`/api/agents/${agentId}/memory`, { method: "POST", body: JSON.stringify({ kind, key, value, source }) }),
  update: (agentId: string, memId: string, value: string, source?: string) =>
    api<{ ok: boolean }>(`/api/agents/${agentId}/memory/${memId}`, { method: "PUT", body: JSON.stringify({ value, source }) }),
  remove: (agentId: string, memId: string) =>
    api<{ ok: boolean }>(`/api/agents/${agentId}/memory/${memId}`, { method: "DELETE" }),
  clear: (agentId: string) =>
    api<{ ok: boolean; removed: number }>(`/api/agents/${agentId}/memory`, { method: "DELETE" }),
};

export const Chats = {
  list: () => api<{ chats: Chat[] }>("/api/chats"),
  create: (agentId: string, title?: string) =>
    api<{ chat: Chat }>("/api/chats", { method: "POST", body: JSON.stringify({ agentId, title }) }),
  get: (id: string) => api<{ chat: Chat; messages: Message[] }>(`/api/chats/${id}`),
  delete: (id: string) => api<{ ok: boolean }>(`/api/chats/${id}`, { method: "DELETE" }),
  remove: (id: string) => api<{ ok: boolean }>(`/api/chats/${id}`, { method: "DELETE" }),
  rename: (id: string, title: string) =>
    api<{ ok: boolean }>(`/api/chats/${id}/rename`, { method: "POST", body: JSON.stringify({ title }) }),
  setActiveAgent: (id: string, agentId: string) =>
    api<{ ok: boolean }>(`/api/chats/${id}/active-agent`, { method: "POST", body: JSON.stringify({ agentId }) }),
  sendMessage: (id: string, content: string) =>
    fetch(`/api/chats/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(api as any).authHeaders },
      body: JSON.stringify({ content }),
    }),
};

export const Skills = {
  list: () => api<{ skills: Skill[] }>("/api/skills"),
  get: (id: string) => api<Skill>(`/api/skills/${id}`),
  save: (id: string, name: string, body: string, description = "") =>
    api<{ skill: Skill }>("/api/skills", { method: "POST", body: JSON.stringify({ id, name, body, description }) }),
  delete: (id: string) => api<{ ok: boolean }>(`/api/skills/${id}`, { method: "DELETE" }),
  remove: (id: string) => api<{ ok: boolean }>(`/api/skills/${id}`, { method: "DELETE" }),
};

export const MCP = {
  list: () => api<{ servers: McpServer[] }>("/api/mcp/servers"),
  save: (name: string, command: string, args: string[], env?: Record<string, string>) =>
    api<{ server: McpServer }>("/api/mcp/servers", { method: "POST", body: JSON.stringify({ name, command, args, env }) }),
  connect: (id: string) =>
    api<{ ok: boolean; needs_oauth?: boolean; oauth?: { connectLinkUrl?: string; connectionId?: string; authType?: string }; needsEnv?: string[]; error?: string }>(
      `/api/mcp/servers/${id}/connect`, { method: "POST" }
    ),
  disconnect: (id: string) => api<{ ok: boolean }>(`/api/mcp/servers/${id}/disconnect`, { method: "POST" }),
  delete: (id: string) => api<{ ok: boolean }>(`/api/mcp/servers/${id}`, { method: "DELETE" }),
  remove: (id: string) => api<{ ok: boolean }>(`/api/mcp/servers/${id}`, { method: "DELETE" }),
  tools: (id: string) => api<{ tools: McpTool[] }>(`/api/mcp/servers/${id}/tools`),
  verifyOAuth: (id: string) =>
    api<{ connected: boolean; connectedAccountId?: string; error?: string }>(
      `/api/mcp/servers/${id}/verify-oauth`, { method: "POST" }
    ),
  setEnv: (id: string, env: Record<string, string>) =>
    api<{ ok: boolean; error?: string }>(
      `/api/mcp/servers/${id}/env`, { method: "PUT", body: JSON.stringify({ env }) }
    ),
};

export const Secrets = {
  list: () => api<{ secrets: SecretMeta[] }>("/api/secrets"),
  save: (name: string, value: string) =>
    api<{ secret: SecretMeta }>(`/api/secrets/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ value }) }),
  remove: (name: string) => api<{ ok: boolean }>(`/api/secrets/${encodeURIComponent(name)}`, { method: "DELETE" }),
};

export const Runs = {
  list: (limit = 100) => api<{ runs: Run[] }>(`/api/runs?limit=${limit}`),
  get: (id: string) => api<{ run: Run; invocations: ToolInvocation[] }>(`/api/runs/${id}`),
  byChat: (chatId: string) => api<{ runs: Run[] }>(`/api/chats/${chatId}/runs`),
};

// ---- Web Space ----
export const Space = {
  list: () => api<{ routes: SpaceRoute[] }>("/api/web-space/routes"),
  get: (id: string) => api<SpaceRoute>(`/api/web-space/routes/${id}`),
  create: (path: string, type: string, code: string, isPublic: boolean) =>
    api<SpaceRoute>("/api/web-space/routes", { method: "POST", body: JSON.stringify({ path, type, code, public: !!isPublic }) }),
  update: (id: string, data: Partial<{ path: string; code: string; type: string; public: boolean }>) =>
    api<{ ok: boolean }>(`/api/web-space/routes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  publish: (id: string, isPublic: boolean) =>
    api<{ ok: boolean }>(`/api/web-space/routes/${id}/publish`, { method: "POST", body: JSON.stringify({ public: !!isPublic }) }),
  delete: (id: string) => api<{ ok: boolean }>(`/api/web-space/routes/${id}`, { method: "DELETE" }),
};

// ---- Workspace ----
export const Workspace = {
  tree: (path: string = "") =>
    api<{ entries: WorkspaceEntry[]; path: string }>(`/api/workspace/tree?path=${encodeURIComponent(path)}`),
  read: (path: string) =>
    api<WorkspaceReadResult>(`/api/workspace/read?path=${encodeURIComponent(path)}`),
  write: (path: string, content: string) =>
    api<{ ok: boolean }>("/api/workspace/write", { method: "PUT", body: JSON.stringify({ path, content }) }),
  delete: (path: string) =>
    api<{ ok: boolean }>("/api/workspace/delete", { method: "DELETE", body: JSON.stringify({ path }) }),
  newFolder: (path: string) =>
    api<{ ok: boolean }>("/api/workspace/mkdir", { method: "POST", body: JSON.stringify({ path }) }),
};

// ---- Automations ----
export const Automations = {
  list: () => api<{ automations: Automation[] }>("/api/automations"),
  get: (id: string) => api<{ automation: Automation }>(`/api/automations/${id}`),
  create: (name: string, instruction: string, rrule: string, description: string = "", agentId: string | null = null) =>
    api<{ automation: Automation }>("/api/automations", { method: "POST", body: JSON.stringify({ name, instruction, rrule, description, agentId }) }),
  update: (id: string, data: Partial<{ name: string; description: string; instruction: string; rrule: string; agentId: string | null; enabled: boolean }>) =>
    api<{ automation: Automation }>(`/api/automations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => api<{ ok: boolean }>(`/api/automations/${id}`, { method: "DELETE" }),
  runs: (id: string, limit: number = 50) =>
    api<{ runs: AutomationRun[] }>(`/api/automations/${id}/runs?limit=${limit}`),
  runNow: (id: string) =>
    api<{ run: AutomationRun; output?: string }>(`/api/automations/${id}/run`, { method: "POST" }),
};

// ---- Integrations (Foundry-powered) ----

export interface PdApp {
  id: string;
  name: string;
  name_slug: string;
  description: string;
  auth_type: "oauth" | "api_key" | "keys" | "none";
  auth_description: string;
  action_count: number;
  trigger_count: number;
  logo_url: string;
  categories: string[];
  connected?: boolean;
}

export interface PdComponent {
  id: string;
  key: string;
  name: string;
  description: string;
  type: "action" | "trigger";
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

export interface IntegrationConnection {
  id: string;
  ownerId: string;
  app_slug: string;
  app_name: string;
  app_description: string;
  auth_type: string;
  auth_description: string;
  logo_url: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  has_credentials: boolean;
  connected_account_id: string | null;
  categories: string[];
  action_count: number;
  created_at: number;
  updated_at: number;
}

export interface IntegrationAction {
  id: string;
  appSlug: string;
  actionKey: string;
  name: string;
  description: string;
  type: "action" | "trigger";
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export const Integrations = {
  catalog: (params?: { q?: string; page?: number; per_page?: number; category?: string }) => {
    const p = new URLSearchParams();
    if (params?.q) p.set("q", params.q);
    if (params?.page) p.set("page", String(params.page));
    if (params?.per_page) p.set("per_page", String(params.per_page));
    if (params?.category) p.set("category", params.category);
    const qs = p.toString();
    return api<{ apps: PdApp[]; total: number; page: number; per_page: number; pages: number }>(
      `/api/integrations/catalog${qs ? `?${qs}` : ""}`
    );
  },
  getCatalogApp: (slug: string) =>
    api<{ app: PdApp & { connected: boolean }; actions: PdComponent[]; triggers: PdComponent[] }>(
      `/api/integrations/catalog/${slug}`
    ),
  refreshCatalogCache: (slug: string) =>
    api<{ ok: boolean; count: number }>(`/api/integrations/catalog/${slug}/refresh`, { method: "POST" }),
  list: () =>
    api<{ connections: IntegrationConnection[]; total?: number }>("/api/integrations"),
  connect: (slug: string) =>
    api<{ connection: IntegrationConnection; warning?: string; oauth?: { connectLinkUrl: string; token: string }; connect_link_url?: string }>(
      `/api/integrations/connect/${slug}`, { method: "POST" }
    ),
  setCredentials: (id: string, value: string) =>
    api<{ ok: boolean; credentialsRef?: string }>(
      `/api/integrations/${id}/credentials`, { method: "PUT", body: JSON.stringify({ value }) }
    ),
  setOAuth: (id: string, connectedAccountId: string) =>
    api<{ ok: boolean }>(
      `/api/integrations/${id}/oauth`, { method: "PUT", body: JSON.stringify({ connectedAccountId }) }
    ),
  disconnect: (id: string) =>
    api<{ ok: boolean }>(`/api/integrations/${id}`, { method: "DELETE" }),
  listActions: (id: string) =>
    api<{ actions: IntegrationAction[] }>(`/api/integrations/${id}/actions`),
  execute: (id: string, actionKey: string, input: Record<string, unknown>) =>
    api<{ result: { id: string; status: string; outputs: Record<string, unknown>; error?: string; duration_ms: number } }>(
      `/api/integrations/${id}/execute`,
      { method: "POST", body: JSON.stringify({ actionKey, input }) }
    ),
  foundryStatus: () =>
    api<{ configured: boolean; valid: boolean; message: string }>("/api/integrations/foundry/status"),
  setFoundryKey: (value: string) =>
    api<{ ok: boolean }>("/api/integrations/foundry/key", { method: "PUT", body: JSON.stringify({ value }) }),
  stats: () =>
    api<{ total: number; byStatus: Record<string, number> }>("/api/integrations/stats"),
  categories: () =>
    api<{ categories: string[]; total: number }>("/api/integrations/categories"),
  connectConfig: () =>
    api<{ configured: boolean; hasProjectId: boolean; hasClientId: boolean; environment: string }>("/api/integrations/connect-config"),
  verifyOAuth: (id: string, token?: string) => {
    const body = token ? JSON.stringify({ token }) : undefined;
    return api<{ connected: boolean; status: string; connectedAccountId?: string; message?: string; error?: string }>(
      `/api/integrations/${id}/verify-oauth`, { method: "POST", body }
    );
  },
};

// ---- Personas ----
export interface Persona {
  id: string;
  ownerId: string;
  name: string;
  prompt: string;
  imageUrl: string;
  imageHue: number;
  model: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export const Personas = {
  list: () => api<{ personas: Persona[] }>("/api/personas"),
  get: (id: string) => api<{ persona: Persona }>(`/api/personas/${id}`),
  create: (name: string, prompt: string, opts: { imageUrl?: string; imageHue?: number; model?: string } = {}) =>
    api<{ persona: Persona }>("/api/personas", { method: "POST", body: JSON.stringify({ name, prompt, ...opts }) }),
  update: (id: string, fields: Partial<{ name: string; prompt: string; imageUrl: string; imageHue: number; model: string }>) =>
    api<{ persona: Persona }>(`/api/personas/${id}`, { method: "PUT", body: JSON.stringify(fields) }),
  setActive: (id: string) =>
    api<{ persona: Persona }>(`/api/personas/${id}/active`, { method: "POST" }),
  delete: (id: string) => api<{ ok: boolean }>(`/api/personas/${id}`, { method: "DELETE" }),
};

export const HistoryStore = {
  get: (id: string) => api<{ history: { id: string; agentId: string; filename: string; content: string; createdAt: number } }>(`/api/history/${id}`),
};

// ---- Timeline ----
export interface TimelineEvent {
  type: "file_change" | "run" | "snapshot";
  agentId: string;
  createdAt: number;
  // file_change
  filename?: string;
  versionId?: string;
  content?: string;
  // run
  runId?: string;
  status?: string;
  chatId?: string;
  totalTokens?: number;
  // snapshot
  snapshotId?: string;
  fileCount?: number;
  byteSize?: number;
  trigger?: string;
}

export const Timeline = {
  list: (limit = 50) => api<{ timeline: TimelineEvent[]; total: number }>(`/api/timeline?limit=${limit}`),
  diff: (id1: string, id2: string) =>
    api<{ a: any; b: any; diff: Array<{ type: string; value: string }> }>(`/api/history/${id1}/diff/${id2}`),
};

// ---- Dashboard ----
export interface DashboardStats {
  counts: {
    [key: string]: number;
  };
  usage: {
    totalTokens: number;
    recentRuns: number;
    failedLast24h: number;
  };
}

export const Dashboard = {
  stats: () => api<DashboardStats>(`/api/dashboard/stats`),
};

// ---- Rules ----
export interface Rule {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  instruction: string;
  category: string;
  priority: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export const Rules = {
  list: () => api<{ rules: Rule[] }>("/api/rules"),
  get: (id: string) => api<{ rule: Rule }>(`/api/rules/${id}`),
  create: (name: string, instruction: string, opts?: { description?: string; category?: string; priority?: number }) =>
    api<{ rule: Rule }>("/api/rules", { method: "POST", body: JSON.stringify({ name, instruction, ...opts }) }),
  update: (id: string, data: Partial<{ name: string; instruction: string; description: string; category: string; priority: number; enabled: boolean }>) =>
    api<{ rule: Rule }>(`/api/rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => api<{ ok: boolean }>(`/api/rules/${id}`, { method: "DELETE" }),
  reorder: (id: string, direction: "up" | "down") =>
    api<{ ok: boolean }>(`/api/rules/${id}/reorder`, { method: "POST", body: JSON.stringify({ direction }) }),
};

// ---- Sites (managed websites) ----
export interface Site {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  variant: string;
  rootDir: string;
  devPort: number | null;
  devStatus: string;
  publishedServiceId: string | null;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export const Sites = {
  list: () => api<{ sites: Site[] }>("/api/sites"),
  get: (id: string) => api<{ site: Site }>(`/api/sites/${id}`),
  create: (name: string, variant?: string) =>
    api<{ site: Site }>("/api/sites", { method: "POST", body: JSON.stringify({ name, variant }) }),
  update: (id: string, data: Partial<{ name: string; description: string; isPublic: boolean }>) =>
    api<{ site: Site }>(`/api/sites/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => api<{ ok: boolean }>(`/api/sites/${id}`, { method: "DELETE" }),
  startDev: (id: string) => api<{ ok: boolean; port?: number; url?: string }>(`/api/sites/${id}/dev`, { method: "POST" }),
  stopDev: (id: string) => api<{ ok: boolean }>(`/api/sites/${id}/dev`, { method: "DELETE" }),
  publish: (id: string, isPublic?: boolean) =>
    api<{ ok: boolean; url?: string }>(`/api/sites/${id}/publish`, { method: "POST", body: JSON.stringify({ public: isPublic }) }),
  unpublish: (id: string) => api<{ ok: boolean }>(`/api/sites/${id}/unpublish`, { method: "POST" }),
  logs: (id: string, tail?: number) =>
    api<{ stdout: string; stderr: string }>(`/api/sites/${id}/logs?tail=${tail ?? 200}`),
};

// ---- Services (managed processes) ----
export interface UserService {
  id: string;
  ownerId: string;
  siteId: string | null;
  label: string;
  mode: string;
  entrypoint: string;
  workdir: string;
  localPort: number;
  isPublic: boolean;
  status: string;
  pid: number | null;
  httpUrl: string;
  tcpAddr: string;
  envVars: Record<string, string>;
  customDomains: string[];
  restartCount: number;
  createdAt: number;
  updatedAt: number;
}

export const Services = {
  list: () => api<{ services: UserService[] }>("/api/services"),
  get: (id: string) => api<{ service: UserService }>(`/api/services/${id}`),
  create: (opts: { label: string; mode: string; entrypoint: string; workdir?: string; localPort?: number; isPublic?: boolean; envVars?: Record<string, string> }) =>
    api<{ service: UserService }>("/api/services", { method: "POST", body: JSON.stringify(opts) }),
  update: (id: string, data: Partial<{ label: string; entrypoint: string; workdir: string; isPublic: boolean; envVars: Record<string, string> }>) =>
    api<{ service: UserService }>(`/api/services/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => api<{ ok: boolean }>(`/api/services/${id}`, { method: "DELETE" }),
  start: (id: string) => api<{ ok: boolean }>(`/api/services/${id}/start`, { method: "POST" }),
  stop: (id: string) => api<{ ok: boolean }>(`/api/services/${id}/stop`, { method: "POST" }),
  restart: (id: string) => api<{ ok: boolean }>(`/api/services/${id}/restart`, { method: "POST" }),
  logs: (id: string, tail?: number) =>
    api<{ logs: { stdout: string; stderr: string } }>(`/api/services/${id}/logs?tail=${tail ?? 200}`),
  addDomain: (id: string, domain: string) =>
    api<{ ok: boolean }>(`/api/services/${id}/domains`, { method: "POST", body: JSON.stringify({ domain }) }),
  removeDomain: (id: string, domain: string) =>
    api<{ ok: boolean }>(`/api/services/${id}/domains/${encodeURIComponent(domain)}`, { method: "DELETE" }),
};
