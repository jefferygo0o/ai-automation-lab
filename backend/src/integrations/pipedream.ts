/**
 * Pipedream Connect API client.
 *
 * Talks to Pipedream's REST API for:
 *   - Browsing the app catalog (~2,500 apps)
 *   - Listing actions/triggers for each app
 *   - Managing connected accounts
 *   - Executing actions on behalf of a connected account
 *
 * Pipedream has TWO distinct sets of credentials, both required for full
 * functionality:
 *
 *   1. **PIPEDREAM_API_KEY** (user API key, "pd_*" prefix) — authenticates
 *      against the project-scoped Connect catalog endpoints:
 *        - GET  /v1/connect/apps
 *        - GET  /v1/connect/apps/{app_id_or_slug}
 *        - GET  /v1/connect/apps/{app_id_or_slug}/categories
 *
 *   2. **PIPEDREAM_CLIENT_ID + CLIENT_SECRET + PROJECT_ID** — an OAuth
 *      client_credentials grant. Used for everything tied to a specific
 *      project/environment:
 *        - POST /v1/oauth/token                       (exchange client creds)
 *        - POST /v1/connect/{project}/tokens          (create connect token)
 *        - GET  /v1/connect/{project}/users/{ext}/accounts
 *        - GET  /v1/connect/{project}/components?app=
 *        - POST /v1/connect/{project}/actions/run     (run action)
 *
 * The user's PIPEDREAM_API_KEY is stored as a lab secret named
 * "pipedream_api_key"; Connect credentials are server-side env vars
 * (PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET, PIPEDREAM_PROJECT_ID,
 * PIPEDREAM_ENVIRONMENT).
 */

const PD_API_BASE = "https://api.pipedream.com/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

export interface PdComponent {
  id: string;
  name: string;
  key: string;
  description: string;
  type: "action" | "trigger";
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

export interface PdConnection {
  id: string;
  app_slug: string;
  name: string;
  status: "active" | "expired" | "error";
  created_at: number;
  expires_at: number | null;
}

export interface PdExecuteResult {
  id: string;
  status: "success" | "error";
  outputs: Record<string, unknown>;
  error?: string;
  duration_ms: number;
  retry_count: number;
}

export interface PdAccount {
  id: string;
  name: string;
  app_id: string;
  app_slug: string;
  status: string;
  healthy: boolean;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Connect config + OAuth token cache
// ---------------------------------------------------------------------------

interface ConnectConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment: string;
}

interface CachedOAuthToken {
  token: string;
  expiresAt: number;
}

export function getConnectConfig(): ConnectConfig | null {
  const clientId = process.env.PIPEDREAM_CLIENT_ID?.trim();
  const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET?.trim();
  const projectId = process.env.PIPEDREAM_PROJECT_ID?.trim();
  if (!clientId || !clientSecret || !projectId) return null;
  return {
    clientId,
    clientSecret,
    projectId,
    environment: process.env.PIPEDREAM_ENVIRONMENT?.trim() ?? "production",
  };
}

let oauthTokenCache: CachedOAuthToken | null = null;

async function getCachedConnectOAuthToken(cfg: ConnectConfig): Promise<string> {
  if (oauthTokenCache && oauthTokenCache.expiresAt > Date.now() + 30_000) {
    return oauthTokenCache.token;
  }
  const tok = await PipedreamClient.createOAuthToken(cfg.clientId, cfg.clientSecret);
  oauthTokenCache = {
    token: tok.access_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  };
  return oauthTokenCache.token;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function connectHeaders(oauthToken: string, environment: string) {
  return {
    Authorization: `Bearer ${oauthToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-pd-environment": environment,
  };
}

function normalizeApp(raw: any): PdApp {
  return {
    id: raw.id ?? raw._id ?? "",
    name: raw.name ?? "",
    name_slug: raw.name_slug ?? raw.slug ?? "",
    description: raw.description ?? "",
    auth_type: (raw.auth_type ?? raw.authType ?? "none") as PdApp["auth_type"],
    auth_description: raw.auth_description ?? raw.authDescription ?? "",
    action_count: raw.action_count ?? raw.actions?.length ?? 0,
    trigger_count: raw.trigger_count ?? raw.triggers?.length ?? 0,
    logo_url: raw.img_src ?? raw.logo_url ?? raw.logoUrl ?? raw.logo ?? "",
    categories: raw.categories ?? raw.tags ?? [],
  };
}

function normalizeComponent(raw: any): PdComponent {
  const isTrigger = (raw.component_type ?? raw.type) === "trigger";
  return {
    id: raw.id ?? raw.key ?? "",
    name: raw.name ?? "",
    key: raw.key ?? raw.id ?? "",
    description: raw.description ?? "",
    type: isTrigger ? "trigger" : "action",
    input_schema: raw.configurable_props ?? raw.input_schema ?? raw.props ?? {},
    output_schema: raw.output_schema ?? {},
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const PipedreamClient = {
  /**
   * Fetch the full app catalog from Pipedream Connect.
   * Walks the paginated cursor on `/v1/connect/apps` until exhausted.
   * Requires a user API key (PIPEDREAM_API_KEY).
   */
  async listApps(apiKey: string): Promise<PdApp[]> {
    const all: PdApp[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("start_cursor", cursor);
      const url = `${PD_API_BASE}/connect/apps?${params.toString()}`;
      const res = await fetch(url, { headers: headers(apiKey) });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Pipedream listApps failed (${res.status}): ${body.slice(0, 300)}`);
      }
      const json = await res.json();
      const apps: PdApp[] = (json.data ?? json.apps ?? []).map(normalizeApp);
      all.push(...apps);
      cursor = json.page_info?.end_cursor ?? null;
      pages += 1;
    } while (cursor && pages < 100);
    return all;
  },

  /**
   * Search the Pipedream app catalog by query string.
   */
  async searchApps(apiKey: string, query: string): Promise<PdApp[]> {
    const params = new URLSearchParams({ q: query, limit: "50" });
    const url = `${PD_API_BASE}/connect/apps?${params.toString()}`;
    const res = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream searchApps failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    return (json.data ?? json.apps ?? []).map(normalizeApp);
  },

  /**
   * Get detailed info for a single app.
   * Uses `/v1/connect/apps/{id_or_slug}` with the user API key. Auth type
   * and category breakdown come from `/apps/{id_or_slug}/categories`
   * (best-effort). Components are NOT included here — call listComponents.
   */
  async getApp(
    apiKey: string,
    appIdOrSlug: string,
  ): Promise<{ app: PdApp; components: PdComponent[] }> {
    const url = `${PD_API_BASE}/connect/apps/${encodeURIComponent(appIdOrSlug)}`;
    const res = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream getApp failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const app = normalizeApp(json.data ?? json);

    // Best-effort: enrich with auth_type + categories.
    try {
      const catRes = await fetch(
        `${PD_API_BASE}/connect/apps/${encodeURIComponent(appIdOrSlug)}/categories`,
        { headers: headers(apiKey) },
      );
      if (catRes.ok) {
        const catJson = await catRes.json();
        const root = catJson.data ?? catJson;
        const inner = root.categories ?? root;
        if (inner.auth_type) app.auth_type = inner.auth_type as PdApp["auth_type"];
        if (inner.auth_description) app.auth_description = inner.auth_description;
        if (Array.isArray(inner.categories) && inner.categories.length) {
          app.categories = inner.categories;
        }
        if (inner.description && !app.description) app.description = inner.description;
      }
    } catch {
      // Non-fatal — keep the basic info.
    }
    return { app, components: [] };
  },

  /**
   * List components (actions + triggers) for a specific app.
   * Requires Connect OAuth credentials. Falls back to an empty list if
   * Connect is not configured (frontend should already warn the user).
   */
  async listComponents(apiKey: string, appSlug: string): Promise<PdComponent[]> {
    // Backward-compat: if Connect is not configured, we cannot list
    // components from the new API. Return [] so callers degrade gracefully.
    const cfg = getConnectConfig();
    if (!cfg) return [];
    const oauthToken = await getCachedConnectOAuthToken(cfg);
    const params = new URLSearchParams({ app: appSlug, limit: "100" });
    const url = `${PD_API_BASE}/connect/${cfg.projectId}/components?${params.toString()}`;
    const res = await fetch(url, {
      headers: connectHeaders(oauthToken, cfg.environment),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream listComponents failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    return (json.data ?? json.components ?? []).map(normalizeComponent);
  },

  /**
   * List connected accounts for the Pipedream user (legacy, user-API-key
   * authenticated). Prefer `listConnectAccounts` for OAuth-managed accounts.
   */
  async listAccounts(apiKey: string): Promise<PdAccount[]> {
    const url = `${PD_API_BASE}/connect/accounts`;
    const res = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream listAccounts failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    return (json.data ?? json.accounts ?? []).map((a: any) => ({
      id: a.id ?? "",
      name: a.name ?? a.app?.name ?? a.app?.name_slug ?? "",
      app_id: a.app?.id ?? "",
      app_slug: a.app?.name_slug ?? "",
      status: a.status ?? "unknown",
      healthy: a.healthy ?? a.status === "active",
      created_at: a.created_at ?? a.ts ?? Date.now(),
      updated_at: a.updated_at ?? Date.now(),
    }));
  },

  /**
   * Delete a connected account from Pipedream.
   * Uses the Connect API (project-scoped) so it works for both legacy
   * and Connect accounts. Requires Connect credentials.
   */
  async deleteAccount(apiKey: string, accountId: string): Promise<boolean> {
    const cfg = getConnectConfig();
    if (!cfg) return false;
    const oauthToken = await getCachedConnectOAuthToken(cfg);
    const url = `${PD_API_BASE}/connect/${cfg.projectId}/accounts/${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: connectHeaders(oauthToken, cfg.environment),
    });
    return res.ok || res.status === 404;
  },

  /**
   * Execute an action on a connected account via Pipedream Connect.
   *
   * POST /v1/connect/{project}/actions/run
   * Body:
   *   { id: <action-key>, external_user_id, configured_props: {...} }
   *
   * The `externalUserId` must match the value used when the connect token
   * was minted (the lab uses `lab_${userId}`). `connectedAccountId` is
   * accepted for call-site compatibility but not used directly — Pipedream
   * resolves the account from `external_user_id` and the action's
   * configurable props at run time.
   */
  async executeAction(
    apiKey: string,
    actionKey: string,
    input: Record<string, unknown>,
    _connectedAccountId: string, // accepted for signature compat, unused
    externalUserId: string = "",
  ): Promise<PdExecuteResult> {
    const cfg = getConnectConfig();
    if (!cfg) {
      throw new Error(
        "Pipedream Connect is not configured (missing PIPEDREAM_CLIENT_ID/SECRET/PROJECT_ID). Cannot execute actions.",
      );
    }
    const oauthToken = await getCachedConnectOAuthToken(cfg);
    const url = `${PD_API_BASE}/connect/${cfg.projectId}/actions/run`;
    const res = await fetch(url, {
      method: "POST",
      headers: connectHeaders(oauthToken, cfg.environment),
      body: JSON.stringify({
        id: actionKey,
        external_user_id: externalUserId || `lab_unknown`,
        configured_props: input ?? {},
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream executeAction failed (${res.status}): ${body.slice(0, 500)}`);
    }
    const json = await res.json();
    return {
      id: json.id ?? "",
      status: json.status === "error" ? "error" : "success",
      outputs: json.outputs ?? json.data ?? json.ret ?? {},
      error: json.error ?? json.err ?? undefined,
      duration_ms: json.duration_ms ?? 0,
      retry_count: json.retry_count ?? 0,
    };
  },

  /**
   * Ping the Pipedream API to verify the key works.
   */
  async ping(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`${PD_API_BASE}/connect/apps?limit=1`, {
        headers: headers(apiKey),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // Connect API (requires OAuth client credentials, not the PD API key)
  // -----------------------------------------------------------------------

  /**
   * Create an OAuth access token for the Pipedream Connect API.
   * Uses the client_credentials grant.
   */
  async createOAuthToken(
    clientId: string,
    clientSecret: string,
    scope = "*",
  ): Promise<{ access_token: string; expires_in: number }> {
    const url = `${PD_API_BASE}/oauth/token`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream OAuth token request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return await res.json();
  },

  /**
   * Create a Connect token for a user.
   * Returns a connect_link_url that the user should be redirected to
   * in order to authorize an app through Pipedream's OAuth flow.
   *
   * https://pipedream.com/docs/connect/api-reference/create-connect-token
   */
  async createConnectToken(
    oauthToken: string,
    projectId: string,
    externalUserId: string,
    opts: {
      app?: string;
      successRedirectUri?: string;
      webhookUri?: string;
      environment?: string;
    } = {},
  ): Promise<{ token: string; connect_link_url: string; expires_at: string }> {
    const env = opts.environment ?? "production";
    const url = `${PD_API_BASE}/connect/${projectId}/tokens`;
    const body: Record<string, unknown> = {
      external_user_id: externalUserId,
    };
    if (opts.app) body.app = opts.app;
    if (opts.successRedirectUri) body.success_redirect_uri = opts.successRedirectUri;
    if (opts.webhookUri) body.webhook_uri = opts.webhookUri;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        "Content-Type": "application/json",
        "x-pd-environment": env,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      const detail = raw.length > 0 ? raw.slice(0, 500) : "(empty body)";
      const hint =
        res.status === 403
          ? " Check that: (1) PIPEDREAM_PROJECT_ID matches a project under Pipedream → Connect → Projects, (2) PIPEDREAM_ENVIRONMENT (currently '" + env + "') matches the project's environment (development/production), and (3) the OAuth client (PIPEDREAM_CLIENT_ID) is linked to this project in Pipedream's Connect settings."
          : "";
      throw new Error(
        `Pipedream createConnectToken failed (${res.status}): ${detail}.${hint}`.trim(),
      );
    }
    return await res.json();
  },

  /**
   * List connected accounts for a Pipedream Connect user.
   *
   * GET /v1/connect/{project_id}/users/{external_user_id}/accounts
   */
  async listConnectAccounts(
    oauthToken: string,
    projectId: string,
    externalUserId: string,
    environment = "production",
  ): Promise<PdAccount[]> {
    const url = `${PD_API_BASE}/connect/${projectId}/users/${encodeURIComponent(externalUserId)}/accounts`;
    const res = await fetch(url, {
      headers: connectHeaders(oauthToken, environment),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream listConnectAccounts failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    return (json.data ?? json.accounts ?? []).map((a: any) => ({
      id: a.id ?? "",
      name: a.name ?? a.app?.name ?? a.app?.name_slug ?? "",
      app_id: a.app?.id ?? "",
      app_slug: a.app?.name_slug ?? "",
      status: a.status ?? "unknown",
      healthy: a.healthy ?? a.status === "active",
      created_at: a.created_at ?? a.ts ?? Date.now(),
      updated_at: a.updated_at ?? Date.now(),
    }));
  },
};
