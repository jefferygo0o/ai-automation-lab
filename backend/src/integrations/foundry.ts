/**
 * Foundry Connect API client.
 *
 * Replaces the prior Pipedream client. Talks to the Foundry Connect gateway
 * over a single Bearer API key (per-user or per-server).
 */

const DEFAULT_BASE_URL = "https://api-gateway-production-4984.up.railway.app";

function baseUrl(): string {
  return process.env.FOUNDRY_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

// -----------------------------------------------------------------------------
// Public types — exported so callers can type their own structures without
// importing from internal Foundry manifests. These names match what the prior
// Pipedream client exported to keep call sites easy to migrate.
// -----------------------------------------------------------------------------

export interface PdApp {
  id: string;
  name_slug: string;
  name: string;
  description: string;
  auth_type: "oauth" | "api_key" | "keys" | "none";
  auth_description: string;
  logo_url: string;
  categories: string[];
  action_count: number;
  trigger_count: number;
  fetched_at: number;
}

export interface PdComponent {
  key: string;
  name: string;
  description: string;
  version: string;
  type: "action" | "trigger";
  app: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

export interface PdAccount {
  id: string;
  app_slug: string;
  app_name: string;
  name: string;
  healthy: boolean;
  created_at: number;
  updated_at: number;
}

export interface PdExecuteResult {
  id: string;
  status: "success" | "error";
  outputs: Record<string, unknown>;
  error?: string;
  duration_ms: number;
  retry_count: number;
}

export interface PdOAuthStartResult {
  authorizationUrl: string;
  state: string;
}

export interface PdConnectTokenResult {
  token: string;
  connect_link_url: string;
  expires_at: number;
}

export interface PdAccountTokenResult {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface FoundryKeyStatus {
  configured: boolean;
  valid: boolean;
  message?: string;
  accountLabel?: string;
}

export type FoundryAuthType = PdApp["auth_type"];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return body ? body.slice(0, 500) : `(empty body, status ${res.status})`;
}

async function get(apiKey: string, path: string, query?: Record<string, string | number | undefined>): Promise<any> {
  const url = new URL(path, baseUrl());
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { headers: headers(apiKey) });
  if (!res.ok) {
    const msg = await readError(res);
    throw new Error(`Foundry GET ${path} failed (${res.status}): ${msg}`);
  }
  return res.json().catch(() => ({}));
}

async function post(apiKey: string, path: string, body: unknown): Promise<any> {
  const res = await fetch(new URL(path, baseUrl()).toString(), {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const msg = await readError(res);
    throw new Error(`Foundry POST ${path} failed (${res.status}): ${msg}`);
  }
  return res.json().catch(() => ({}));
}

async function del(apiKey: string, path: string): Promise<any> {
  const res = await fetch(new URL(path, baseUrl()).toString(), {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) {
    const msg = await readError(res);
    throw new Error(`Foundry DELETE ${path} failed (${res.status}): ${msg}`);
  }
  return res.json().catch(() => ({}));
}

function authTypeFromManifest(t: { type?: string } | undefined): FoundryAuthType {
  switch (t?.type) {
    case "oauth2":
      return "oauth";
    case "apikey":
    case "api_key":
      return "api_key";
    case "keys":
      return "keys";
    default:
      return "none";
  }
}

function normalizeProvider(p: any): PdApp {
  const slug = p?.name ?? p?.name_slug ?? p?.slug ?? p?.id ?? "";
  return {
    id: p?.id ?? slug,
    name_slug: slug,
    name: p?.displayName ?? p?.name ?? slug,
    description: p?.description ?? "",
    auth_type: authTypeFromManifest(p?.auth),
    auth_description: p?.auth?.description ?? "",
    logo_url: p?.logoUrl ?? p?.logo_url ?? "",
    categories: p?.categories ?? [],
    action_count: Array.isArray(p?.actions) ? p.actions.length : p?.action_count ?? 0,
    trigger_count: Array.isArray(p?.triggers) ? p.triggers.length : p?.trigger_count ?? 0,
    fetched_at: Date.now(),
  };
}

function normalizeAction(a: any, appSlug: string): PdComponent {
  return {
    key: a?.name ?? a?.key ?? "",
    name: a?.displayName ?? a?.name ?? "",
    description: a?.description ?? "",
    version: a?.crbVersion ?? a?.version ?? "0",
    type: a?.type === "trigger" ? "trigger" : "action",
    app: appSlug,
    input_schema: a?.inputSchema ?? a?.input_schema ?? {},
    output_schema: a?.outputSchema ?? a?.output_schema ?? {},
  };
}

function normalizeAccount(raw: any): PdAccount {
  return {
    id: raw?.id ?? raw?.accountId ?? "",
    app_slug: raw?.appSlug ?? raw?.provider ?? raw?.app ?? "",
    app_name: raw?.appName ?? raw?.app_name ?? "",
    name: raw?.name ?? raw?.displayName ?? "",
    healthy: raw?.healthy ?? true,
    created_at: raw?.createdAt ?? raw?.created_at ?? 0,
    updated_at: raw?.updatedAt ?? raw?.updated_at ?? 0,
  };
}

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------

export const FoundryClient = {
  toAuthType(t: string | undefined): FoundryAuthType {
    return authTypeFromManifest({ type: t });
  },

  async status(apiKey: string): Promise<FoundryKeyStatus> {
    if (!apiKey) return { configured: false, valid: false, message: "No Foundry API key configured" };
    try {
      const res = await fetch(`${baseUrl()}/v1/providers`, {
        headers: headers(apiKey),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { configured: true, valid: false, message: `Foundry responded ${res.status}` };
      }
      const json = await res.json().catch(() => ({}));
      const accountLabel = json?.account?.name ?? json?.org?.name ?? undefined;
      return { configured: true, valid: true, accountLabel };
    } catch (e: any) {
      return { configured: true, valid: false, message: e?.message ?? String(e) };
    }
  },

  async listApps(apiKey: string): Promise<PdApp[]> {
    const json = await get(apiKey, "/v1/providers");
    const providers = json?.providers ?? json?.data ?? [];
    return providers.map(normalizeProvider);
  },

  async searchApps(apiKey: string, query: string): Promise<PdApp[]> {
    const all = await FoundryClient.listApps(apiKey);
    const q = query.toLowerCase();
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.name_slug.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  },

  async getApp(apiKey: string, appSlug: string): Promise<{ app: PdApp; components: PdComponent[] }> {
    const json = await get(apiKey, `/v1/providers/${encodeURIComponent(appSlug)}`);
    const provider = json?.provider ?? json?.data ?? json;
    const app = normalizeProvider(provider);
    const actions = Array.isArray(provider?.actions) ? provider.actions : [];
    const components = actions.map((a: any) => normalizeAction(a, app.name_slug));
    return { app, components };
  },

  async listComponents(apiKey: string, appSlug: string): Promise<PdComponent[]> {
    const json = await get(apiKey, `/v1/providers/${encodeURIComponent(appSlug)}/actions`);
    const actions = json?.actions ?? json?.data ?? [];
    return actions.map((a: any) => normalizeAction(a, appSlug));
  },

  async startOAuth(
    apiKey: string,
    provider: string,
    opts: { externalUserId: string; redirectUri?: string; scopes?: string[] },
  ): Promise<PdOAuthStartResult> {
    const json = await post(apiKey, "/v1/oauth/start", {
      provider,
      externalUserId: opts.externalUserId,
      redirectUri: opts.redirectUri,
      scopes: opts.scopes,
    });
    return {
      authorizationUrl: json?.authorizationUrl ?? json?.url ?? "",
      state: json?.state ?? json?.oauthState ?? "",
    };
  },

  async getConnectToken(apiKey: string, state: string): Promise<PdConnectTokenResult> {
    const json = await get(apiKey, "/v1/oauth/token", { state });
    return {
      token: json?.token ?? "",
      connect_link_url: json?.connectLinkUrl ?? json?.connect_link_url ?? "",
      expires_at: json?.expiresAt ?? json?.expires_at ?? Date.now() + 600_000,
    };
  },

  async createAccountToken(apiKey: string, accountId: string): Promise<PdAccountTokenResult> {
    const json = await post(apiKey, "/v1/connections/account-token", { accountId });
    return {
      access_token: json?.accessToken ?? json?.access_token ?? "",
      expires_in: json?.expiresIn ?? json?.expires_in ?? 3600,
      token_type: json?.tokenType ?? json?.token_type ?? "Bearer",
    };
  },

  async listConnections(apiKey: string, filter?: string | { provider?: string }): Promise<PdAccount[]> {
    const query: Record<string, string> = {};
    if (typeof filter === "string") query.provider = filter;
    else if (filter?.provider) query.provider = filter.provider;
    const json = await get(apiKey, "/v1/connections", query);
    const list = json?.items ?? json?.connections ?? json?.data ?? [];
    return list.map(normalizeAccount);
  },

  async deleteAccount(apiKey: string, accountId: string): Promise<boolean> {
    await del(apiKey, `/v1/connections/${encodeURIComponent(accountId)}`);
    return true;
  },

  async executeAction(
    apiKey: string,
    appSlug: string,
    actionKey: string,
    input: Record<string, unknown>,
    accountId?: string,
    externalUserId?: string,
  ): Promise<PdExecuteResult> {
    const body: Record<string, unknown> = {
      app: appSlug,
      action: actionKey,
      input,
    };
    if (accountId) body.accountId = accountId;
    if (externalUserId) body.externalUserId = externalUserId;
    const json = await post(apiKey, "/v1/actions/execute", body);
    return {
      id: json?.id ?? json?.executionId ?? "",
      status: json?.status === "error" ? "error" : "success",
      outputs: json?.outputs ?? json?.output ?? {},
      error: json?.error,
      duration_ms: json?.durationMs ?? json?.duration_ms ?? 0,
      retry_count: json?.retryCount ?? json?.retry_count ?? 0,
    };
  },

  // Aliases / convenience methods ------------------------------------------------

  async ping(apiKey: string): Promise<boolean> {
    const s = await FoundryClient.status(apiKey);
    return s.valid;
  },

  async getProvider(apiKey: string, provider: string): Promise<PdApp> {
    const { app } = await FoundryClient.getApp(apiKey, provider);
    return app;
  },

  async listActions(apiKey: string, provider: string): Promise<PdComponent[]> {
    return FoundryClient.listComponents(apiKey, provider);
  },

  async listProviderActions(apiKey: string, provider: string): Promise<PdComponent[]> {
    return FoundryClient.listComponents(apiKey, provider);
  },
};

// -----------------------------------------------------------------------------
// Backwards-compat alias — keeps old imports (`PipedreamClient`) compiling
// while we migrate every call site to the new name.
// -----------------------------------------------------------------------------
export const PipedreamClient = FoundryClient;
