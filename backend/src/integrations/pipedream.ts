/**
 * Pipedream Connect API client.
 *
 * Talks to Pipedream's REST API for:
 *   - Browsing the app catalog (2,500+ apps)
 *   - Listing actions/triggers for each app
 *   - Managing connected accounts
 *   - Executing actions on behalf of a connected account
 *
 * The user's Pipedream API key is stored as a lab secret named "pipedream_api_key".
 * For OAuth-based integrations, Pipedream Connect handles the full OAuth flow;
 * the lab stores the resulting `connected_account_id` for each integration.
 */

const PD_API_BASE = "https://api.pipedream.com/v1";

/** Headers used for all Pipedream API calls. */
function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

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
// Client
// ---------------------------------------------------------------------------

export const PipedreamClient = {
  /**
   * Fetch the full app catalog from Pipedream.
   *
   * Returns all pages from the /apps endpoint — currently ~2,500 apps in
   * Pipedream's catalog. We do not cap the result size here; per-page is
   * 100 and we keep walking the cursor until the API stops returning one.
   */
  async listApps(apiKey: string): Promise<PdApp[]> {
    const all: PdApp[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("start_cursor", cursor);
      const url = `${PD_API_BASE}/apps?${params.toString()}`;
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
    } while (cursor && pages < 100); // hard cap at 10,000 apps as a safety net
    return all;
  },

  /**
   * Search the Pipedream app catalog by query string.
   */
  async searchApps(apiKey: string, query: string): Promise<PdApp[]> {
    const params = new URLSearchParams({ q: query, limit: "50" });
    const url = `${PD_API_BASE}/apps?${params.toString()}`;
    const res = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream searchApps failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    return (json.data ?? json.apps ?? []).map(normalizeApp);
  },

  /**
   * Get detailed info for a single app, including its action/trigger components.
   */
  async getApp(apiKey: string, appSlug: string): Promise<{ app: PdApp; components: PdComponent[] }> {
    const url = `${PD_API_BASE}/apps/${appSlug}`;
    const res = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream getApp failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const app = normalizeApp(json.data ?? json);
    const components: PdComponent[] = (json.components ?? json.actions ?? []).map((c: any) => ({
      id: c.id ?? c.key ?? "",
      name: c.name ?? "",
      key: c.key ?? c.id ?? "",
      description: c.description ?? "",
      type: c.type === "trigger" ? "trigger" : "action",
      input_schema: c.input_schema ?? c.props ?? {},
      output_schema: c.output_schema ?? {},
    }));
    return { app, components };
  },

  /**
   * List components (actions + triggers) for a specific app.
   */
  async listComponents(apiKey: string, appSlug: string): Promise<PdComponent[]> {
    const url = `${PD_API_BASE}/components?app=${appSlug}`;
    const res = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream listComponents failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    return (json.data ?? json.components ?? []).map((c: any) => ({
      id: c.id ?? c.key ?? "",
      name: c.name ?? "",
      key: c.key ?? c.id ?? "",
      description: c.description ?? "",
      type: c.type === "trigger" ? "trigger" : "action",
      input_schema: c.input_schema ?? c.props ?? {},
      output_schema: c.output_schema ?? {},
    }));
  },

  /**
   * List connected accounts for the Pipedream user.
   */
  async listAccounts(apiKey: string): Promise<PdAccount[]> {
    const url = `${PD_API_BASE}/accounts`;
    const res = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream listAccounts failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    return (json.data ?? json.accounts ?? []).map((a: any) => ({
      id: a.id ?? "",
      name: a.name ?? a.app_slug ?? "",
      app_id: a.app_id ?? "",
      app_slug: a.app_slug ?? "",
      status: a.status ?? "unknown",
      healthy: a.healthy ?? a.status === "active",
      created_at: a.created_at ?? a.ts ?? Date.now(),
      updated_at: a.updated_at ?? Date.now(),
    }));
  },

  /**
   * Delete a connected account from Pipedream.
   */
  async deleteAccount(apiKey: string, accountId: string): Promise<boolean> {
    const url = `${PD_API_BASE}/accounts/${accountId}`;
    const res = await fetch(url, { method: "DELETE", headers: headers(apiKey) });
    return res.ok || res.status === 404;
  },

  /**
   * Execute an action on a connected account.
   *
   * Uses Pipedream Connect API:
   *   POST /connect/{project_id}/actions/run
   *
   * The request body includes:
   *   - external_user_id: the connected account's owner
   *   - action: the action key (e.g., "slack-send-message")
   *   - input: the action parameters
   *   - auth_provision_id: the connected account ID
   */
  async executeAction(
    apiKey: string,
    actionKey: string,
    input: Record<string, unknown>,
    connectedAccountId: string,
  ): Promise<PdExecuteResult> {
    const url = `${PD_API_BASE}/components/${actionKey}/invoke`;
    const res = await fetch(url, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        connected_account_id: connectedAccountId,
        input,
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
      outputs: json.outputs ?? json.data ?? {},
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
      const res = await fetch(`${PD_API_BASE}/apps?limit=1`, {
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
    scope = "connect:accounts:write connect:accounts:read"
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
      // Include extra context for 403s — common Pipedream Connect config issues
      const hint =
        res.status === 403
          ? "Check that: (1) PIPEDREAM_PROJECT_ID matches a project under Pipedream → Connect → Projects, (2) PIPEDREAM_ENVIRONMENT (currently '" + env + "') matches the project's environment (development/production), and (3) the OAuth client (PIPEDREAM_CLIENT_ID) is linked to this project in Pipedream's Connect settings."
          : "";
      throw new Error(
        `Pipedream createConnectToken failed (${res.status}): ${detail}. ${hint}`.trim()
      );
    }
    return await res.json();
  },

  /**
   * List connected accounts for a user through Pipedream Connect.
   */
  async listConnectAccounts(
    oauthToken: string,
    projectId: string,
    externalUserId: string,
    environment = "production",
  ): Promise<PdAccount[]> {
    const url = `${PD_API_BASE}/connect/${projectId}/accounts?external_user_id=${encodeURIComponent(externalUserId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        "x-pd-environment": environment,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pipedream listConnectAccounts failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    return (json.data ?? json.accounts ?? []).map((a: any) => ({
      id: a.id ?? "",
      name: a.name ?? a.app_slug ?? "",
      app_id: a.app_id ?? "",
      app_slug: a.app_slug ?? "",
      status: a.status ?? "unknown",
      healthy: a.healthy ?? a.status === "active",
      created_at: a.created_at ?? a.ts ?? Date.now(),
      updated_at: a.updated_at ?? Date.now(),
    }));
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    logo_url: raw.logo_url ?? raw.logoUrl ?? raw.logo ?? raw.img_src ?? "",
    categories: raw.categories ?? raw.tags ?? [],
  };
}
