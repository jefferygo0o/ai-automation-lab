/**
 * Integrations API routes.
 *
 * Mounted under /api/integrations in the main API server.
 * Provides endpoints for:
 *   - Browsing the Foundry Connect provider catalog (with search)
 *   - Connecting/disconnecting integrations
 *   - Listing and executing integration actions
 *   - Syncing the action cache
 *
 * Auth: single Foundry Connect API key (FOUNDRY_API_KEY) stored per-user
 * as the `foundry_api_key` secret. Used for all upstream calls.
 *
 * OAuth flow:
 *   - The lab calls Foundry `POST /v1/oauth/start` to get an
 *     `authorizationUrl`, which it surfaces to the browser.
 *   - Foundry completes the OAuth dance and redirects back to its
 *     own callback. Connections are then visible via
 *     `GET /v1/connections` and the lab reconciles by polling
 *     (`/:id/verify-oauth`) or via Foundry's webhook to
 *     `/api/integrations/oauth-webhook`.
 */

import { Hono } from "hono";
import { FoundryClient, type PdComponent, type PdApp } from "./foundry.ts";
import { IntegrationRegistry, type IntegrationConnection, type CachedCatalogApp } from "./registry.ts";
import { SecretStore } from "../secrets/store.ts";
import { Audit } from "../audit/index.ts";

const API = new Hono<{ Variables: { userId: string } }>();

// Prevent concurrent catalog syncs per user
const syncLocks = new Set<string>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache for catalog

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the user's Foundry API key.
 * Resolution order:
 *   1. Process env (FOUNDRY_API_KEY) — useful for self-hosted / CI.
 *   2. Secrets DB (case-insensitive lookup of "foundry_api_key").
 * Either source is accepted; the env var wins when present.
 */
async function getPdApiKey(ownerId: string): Promise<string | null> {
  const envKey = process.env.FOUNDRY_API_KEY?.trim();
  if (envKey && envKey.length > 0) return envKey;
  return await SecretStore.getCI(ownerId, "foundry_api_key");
}

/** Reusable guard — returns 400 if no PD key set. */
async function requiresPdKey(ownerId: string, c: any): Promise<string | null> {
  const key = await getPdApiKey(ownerId);
  if (!key) {
    c.status(400);
    return null;
  }
  return key;
}

/** Strip the full connection when returning from the API, mapping to snake_case for the frontend. */
function sanitizeConn(c: IntegrationConnection) {
  return {
    id: c.id,
    ownerId: c.ownerId,
    app_slug: c.appSlug,
    app_name: c.appName,
    app_description: c.appDescription,
    auth_type: c.authType,
    auth_description: c.authDescription,
    logo_url: c.logoUrl,
    status: c.status,
    has_credentials: !!c.credentialsRef,
    connected_account_id: c.connectedAccountId,
    categories: c.categories,
    action_count: 0,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Foundry Connect (OAuth flow) — Foundry exposes a single bearer-auth API;
// the OAuth "start" call is made via FoundryClient.startOAuth().
// ---------------------------------------------------------------------------

async function pdKeyMissingPayload(ownerId: string) {
  const existing = await (await SecretStore.list(ownerId)).map((s) => s.name);
  return {
    error:
      "Foundry API key not configured. Save it as a secret named 'foundry_api_key' on the Secrets page, or set the FOUNDRY_API_KEY environment variable on the server.",
    hint: "Secret lookup is case-insensitive, so any case works.",
    yourSecrets: existing,
  };
}

// ---------------------------------------------------------------------------
// Catalog Cache — background sync helper
// ---------------------------------------------------------------------------

/**
 * Fetch the full Foundry catalog and cache it locally.
 * Updates sync state so the UI can show progress.
 */
async function syncCatalogFromPd(ownerId: string, pdKey: string): Promise<number> {
  if (syncLocks.has(ownerId)) {
    console.log("[sync] skipping — sync already in progress for", ownerId);
    return 0;
  }
  syncLocks.add(ownerId);
  console.log("[sync] starting sync for", ownerId);
  await IntegrationRegistry.updateCatalogSyncState(ownerId, "syncing", { total: 0 });
  try {
    const apps = await FoundryClient.listApps(pdKey);
    console.log("[sync] Foundry listApps returned", apps.length, "apps");
    await IntegrationRegistry.cacheAppCatalog(ownerId, apps);
    await IntegrationRegistry.updateCatalogSyncState(ownerId, "complete", { total: apps.length });
    console.log("[sync] complete for", ownerId, "(" + apps.length + " apps)");
    return apps.length;
  } catch (e: any) {
    console.error("[sync] error for", ownerId + ":", e?.message ?? String(e));
    await IntegrationRegistry.updateCatalogSyncState(ownerId, "error", {
      errorMessage: e?.message ?? String(e),
    });
    throw e;
  } finally {
    syncLocks.delete(ownerId);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// ----- Catalog -----

/**
 * POST /api/integrations/catalog/sync
 * Force a full re-sync of the Foundry app catalog into the local cache.
 */
API.post("/catalog/sync", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = await requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  try {
    const count = await syncCatalogFromPd(userId, pdKey);
    return c.json({ ok: true, count });
  } catch (e: any) {
    return c.json({ error: `Sync failed: ${e?.message ?? String(e)}` }, 502);
  }
});

/**
 * GET /api/integrations/categories
 * Return the list of known integration categories from the local cache.
 * - First request ever: syncs synchronously (blocks ~8s once, then instant forever)
 * - Subsequent stale requests: returns cached data + triggers fire-and-forget refresh
 */
API.get("/categories", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = await requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  try {
    const count = await IntegrationRegistry.getCachedAppsCount(userId);
    const fresh = await IntegrationRegistry.isCacheFresh(userId, CACHE_TTL_MS);

    // Never block on Foundry — return cached data immediately.
    // If the cache is empty or stale, trigger a background refresh.
    if (count === 0 || !fresh) {
      syncCatalogFromPd(userId, pdKey).catch(e => console.error("[integrations] sync error:", e?.message ?? String(e)));
    }

    const categories = await IntegrationRegistry.getCachedCategories(userId);
    const syncState = await IntegrationRegistry.getCatalogSyncState(userId);

    return c.json({
      categories,
      total: categories.length,
      sync_state: syncState
        ? { status: syncState.status, total: syncState.total }
        : null,
    });
  } catch (e: any) {
    return c.json({ error: `Failed to fetch categories: ${e?.message ?? String(e)}` }, 502);
  }
});

/**
 * GET /api/integrations/catalog
 * Browse the Foundry app catalog from the local cache.
 * Supports ?q=search&page=&per_page=&category=
 * Auto-triggers background sync if cache is stale.
 */
API.get("/catalog", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = await requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const query = c.req.query("q")?.trim() ?? "";
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(c.req.query("per_page") ?? 50)));
  const category = c.req.query("category")?.toLowerCase() ?? "";

  try {
    const count = await IntegrationRegistry.getCachedAppsCount(userId);
    const fresh = await IntegrationRegistry.isCacheFresh(userId, CACHE_TTL_MS);

    // Get connected slugs up front
    const connected = new Set(
      (await IntegrationRegistry.list(userId)).map((i) => i.appSlug),
    );

    // --- Live fallback for cold / empty cache ---
    // On a fresh deploy (e.g. Render) the local cache is empty, so the
    // original "background sync + return cached" strategy returned [] for
    // every request. To make search and browse work immediately, when the
    // cache has zero apps for this user we synchronously fetch from
    // Foundry and persist the result. For search queries, we also fall
    // back to Foundry live when the local cache has no matches.
    let liveFetched: PdApp[] | null = null;
    if (count === 0) {
      try {
        liveFetched = query
          ? await FoundryClient.searchApps(pdKey, query)
          : await FoundryClient.listApps(pdKey);
        if (liveFetched.length > 0) {
          await IntegrationRegistry.cacheAppCatalog(userId, liveFetched);
        }
      } catch (e: any) {
        console.error("[catalog] live fetch failed:", e?.message ?? String(e));
      }
      // Also kick off a full sync in the background so the cache fills in.
      syncCatalogFromPd(userId, pdKey).catch(e =>
        console.error("[integrations] background sync error:", e?.message ?? String(e)),
      );
    } else if (query) {
      // Cache has apps but search yielded nothing — try Foundry live as a supplement.
      const localResult = await IntegrationRegistry.searchCachedApps(userId, query, 1, 10000);
      if (localResult.total === 0) {
        try {
          liveFetched = await FoundryClient.searchApps(pdKey, query);
          if (liveFetched.length > 0) {
            await IntegrationRegistry.cacheAppCatalog(userId, liveFetched);
          }
        } catch (e: any) {
          console.error("[catalog] live search failed:", e?.message ?? String(e));
        }
      }
    } else if (!fresh) {
      // Cache exists but is stale — refresh in the background.
      syncCatalogFromPd(userId, pdKey).catch(e =>
        console.error("[integrations] background sync error:", e?.message ?? String(e)),
      );
    }

    let apps: CachedCatalogApp[];
    let total: number;

    if (liveFetched) {
      // Use the live results directly (already cached for next time).
      apps = liveFetched.map((a): CachedCatalogApp => ({
        id: `cat_live_${a.name_slug}`,
        ownerId: userId,
        appSlug: a.name_slug,
        name: a.name,
        description: a.description ?? "",
        authType: (a.auth_type ?? "") as CachedCatalogApp["authType"],
        authDescription: a.auth_description ?? "",
        actionCount: a.action_count ?? 0,
        triggerCount: a.trigger_count ?? 0,
        logoUrl: a.logo_url ?? "",
        categories: a.categories ?? [],
        fetchedAt: Date.now(),
      }));
      total = apps.length;
    } else if (query) {
      const result = await IntegrationRegistry.searchCachedApps(userId, query, 1, 10000);
      apps = result.apps;
      total = result.total;
    } else {
      apps = await IntegrationRegistry.getCachedApps(userId);
      total = apps.length;
    }

    // Filter by category client-side (the cache stores categories as JSON arrays)
    if (category) {
      apps = apps.filter((a) =>
        a.categories.some((cat: string) => cat.toLowerCase().includes(category)),
      );
      total = apps.length;
    }

    // Sort by connected first, then name
    apps.sort((a, b) => {
      const aCon = connected.has(a.appSlug) ? 0 : 1;
      const bCon = connected.has(b.appSlug) ? 0 : 1;
      if (aCon !== bCon) return aCon - bCon;
      return a.name.localeCompare(b.name);
    });

    const start = (page - 1) * perPage;
    const paged = apps.slice(start, start + perPage);
    const pages = Math.ceil(total / perPage);

    return c.json({
      apps: paged.map((a) => ({
        id: a.id,
        name: a.name,
        name_slug: a.appSlug,
        description: a.description,
        auth_type: a.authType,
        auth_description: a.authDescription,
        action_count: a.actionCount,
        trigger_count: a.triggerCount,
        logo_url: a.logoUrl,
        categories: a.categories,
        connected: connected.has(a.appSlug),
      })),
      total,
      page,
      per_page: perPage,
      pages,
      sync_state: await IntegrationRegistry.getCatalogSyncState(userId).then(s =>
        s ? { status: s.status, total: s.total } : null,
      ),
    });
  } catch (e: any) {
    return c.json({ error: `Failed to fetch catalog: ${e?.message ?? String(e)}` }, 502);
  }
});

/**
 * GET /api/integrations/catalog/:slug
 * Get details + actions for a specific app.
 */
API.get("/catalog/:slug", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = await requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const slug = c.req.param("slug");

  try {
    // Check cache first
    const cached = await IntegrationRegistry.listCachedActions(slug);
    const cacheTs = await IntegrationRegistry.getCacheTimestamp(slug);
    const isFresh = cacheTs && (Date.now() - cacheTs) < CACHE_TTL_MS;

    let app: any;
    let components = cached;

    if (isFresh && cached.length > 0) {
      // Use cached data — get basic app info from the first entry
      const conn = await IntegrationRegistry.getByApp(userId, slug);
      app = {
        name_slug: slug,
        name: conn?.appName ?? slug,
        description: conn?.appDescription ?? "",
        logo_url: conn?.logoUrl ?? "",
        auth_type: conn?.authType ?? "none",
        auth_description: conn?.authDescription ?? "",
        action_count: cached.filter((c) => c.type === "action").length,
        trigger_count: cached.filter((c) => c.type === "trigger").length,
        categories: conn?.categories ?? [],
        cached: true,
      };
    } else {
      // Fetch app + components from Foundry.
      // Note: Foundry Connect split these into two endpoints — getApp
      // returns app metadata only; components come from listComponents.
      const result = await FoundryClient.getApp(pdKey, slug);
      app = result.app;
      try {
        const list = await FoundryClient.listComponents(pdKey, slug);
        components = list.map((comp: any) => ({
          id: comp.id,
          appSlug: slug,
          actionKey: comp.key,
          name: comp.name,
          description: comp.description,
          type: comp.type,
          inputSchema: comp.input_schema,
          outputSchema: comp.output_schema ?? {},
        }));
      } catch (componentErr: any) {
        // If components can't be fetched (e.g. Connect not configured),
        // return app metadata only rather than failing the whole request.
        console.warn("[integrations] listComponents failed for", slug + ":", componentErr?.message ?? String(componentErr));
        components = [];
      }
      if (components.length > 0) {
        await IntegrationRegistry.cacheActions(slug, components);
      }
    }

    const connected = !!(await IntegrationRegistry.getByApp(userId, slug));

    return c.json({
      app: { ...app, connected },
      actions: components.filter((c) => c.type === "action"),
      triggers: components.filter((c) => c.type === "trigger"),
    });
  } catch (e: any) {
    return c.json({ error: `Failed to fetch app: ${e?.message ?? String(e)}` }, 502);
  }
});

/**
 * POST /api/integrations/catalog/:slug/refresh
 * Force-refresh the cached actions for an app.
 */
API.post("/catalog/:slug/refresh", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = await requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const slug = c.req.param("slug");
  try {
    // Foundry Connect split the legacy /apps/{slug} endpoint: app
    // metadata comes from getApp, components come from listComponents.
    await FoundryClient.getApp(pdKey, slug);
    const list = await FoundryClient.listComponents(pdKey, slug);
    const components = list.map((comp: any) => ({
      id: comp.key,
      appSlug: slug,
      actionKey: comp.key,
      name: comp.name,
      description: comp.description,
      type: comp.type,
      inputSchema: comp.input_schema,
      outputSchema: comp.output_schema ?? {},
    }));
    await IntegrationRegistry.cacheActions(slug, components);
    return c.json({ ok: true, count: components.length });
  } catch (e: any) {
    return c.json({ error: `Refresh failed: ${e?.message ?? String(e)}` }, 502);
  }
});

// ----- Connected Integrations -----

/**
 * GET /api/integrations
 * List all connected integrations for the current user.
 */
API.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const connections = await IntegrationRegistry.list(userId);
  return c.json({ connections: connections.map(sanitizeConn) });
});

/**
 * POST /api/integrations/connect/:slug
 * Create a new integration connection for an app.
 * Body can include optional `credentials` (an API key for api_key apps).
 */
API.post("/connect/:slug", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = await requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const slug = c.req.param("slug");

  // Check if already connected
  const existing = await IntegrationRegistry.getByApp(userId, slug);
  if (existing) {
    return c.json({ error: "Already connected", connection: sanitizeConn(existing) }, 409);
  }

  // Fetch app details from Foundry
  try {
    const { app } = await FoundryClient.getApp(pdKey, slug);

    // Components now come from a separate endpoint in the new Connect API.
    let components: PdComponent[] = [];
    try {
      components = await FoundryClient.listComponents(pdKey, slug);
    } catch (componentErr: any) {
      console.warn(
        "[integrations] listComponents failed for",
        slug + ":",
        componentErr?.message ?? String(componentErr),
      );
    }

    // Cache the components
    const cached = components.map((comp) => ({
      id: comp.key,
      appSlug: slug,
      actionKey: comp.key,
      name: comp.name,
      description: comp.description,
      type: comp.type,
      inputSchema: comp.input_schema ?? {},
      outputSchema: comp.output_schema ?? {},
    }));
    if (cached.length > 0) {
      await IntegrationRegistry.cacheActions(slug, cached);
    }

    // Create the connection record
    const conn = await IntegrationRegistry.create(userId, {
      appSlug: app.name_slug,
      appName: app.name,
      appDescription: app.description,
      authType: app.auth_type,
      authDescription: app.auth_description,
      logoUrl: app.logo_url,
      categories: app.categories,
    });

    Audit.record({
      ownerId: userId,
      actor: "user",
      action: "integration.connect",
      targetId: conn.id,
      targetType: "integration",
      metadata: { appSlug: slug, appName: app.name },
    });

    // For OAuth apps, start the OAuth flow via Foundry Connect and return
    // the authorization URL for the browser to redirect to.
    if (app.auth_type === "oauth") {
      try {
        const host = c.req.header("host") ?? "";
        const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
        const baseUrl = `${proto}://${host}`;
        const { authorizationUrl } = await FoundryClient.startOAuth(pdKey, slug, {
          externalUserId: `lab_${userId}`,
          redirectUri: `${baseUrl}/integrations?oauth_success=${conn.id}`,
        });
        await IntegrationRegistry.updateStatus(conn.id, userId, "connecting");
        return c.json({
          connection: sanitizeConn(conn),
          oauth: { authorizationUrl },
        });
      } catch (oauthErr: any) {
        console.warn("[integrations] OAuth start failed:", oauthErr?.message ?? String(oauthErr));
        return c.json({
          error: `Failed to initiate OAuth flow: ${oauthErr?.message ?? String(oauthErr)}. Check your Foundry API key and try again.`,
          connection: sanitizeConn(conn),
        }, 502);
      }
    }

    return c.json({ connection: sanitizeConn(conn) });
  } catch (e: any) {
    // If Foundry fetch fails, still allow a minimal connection
    const conn = await IntegrationRegistry.create(userId, {
      appSlug: slug,
      appName: slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      appDescription: "",
      authType: "api_key",
      authDescription: "",
      logoUrl: "",
      categories: [],
    });
    return c.json({ connection: sanitizeConn(conn), warning: `Created without catalog data: ${e?.message}` });
  }
});

/**
 * PUT /api/integrations/:id/credentials
 * Store credentials for an integration (API key, etc.).
 */
API.put("/:id/credentials", async (c) => {
  const userId = c.get("userId") as string;
  const conn = await IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);

  const { value } = (await c.req.json()) as { value: string };
  const refName = `int_cred_${conn.appSlug}`;

  // Store as a secret
  await SecretStore.set(userId, refName, value);

  await IntegrationRegistry.updateStatus(conn.id, userId, "connected", {
    credentialsRef: refName,
  });

  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "integration.credentials",
    targetId: conn.id,
    targetType: "integration",
    metadata: { appSlug: conn.appSlug },
  });

  return c.json({ ok: true, credentialsRef: refName });
});

/**
 * PUT /api/integrations/:id/oauth-callback
 * Record a Foundry connected_account_id after OAuth flow.
 */
API.put("/:id/oauth", async (c) => {
  const userId = c.get("userId") as string;
  const conn = await IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);

  const { connectedAccountId } = (await c.req.json()) as { connectedAccountId: string };
  await IntegrationRegistry.updateStatus(conn.id, userId, "connected", {
    connectedAccountId,
  });

  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "integration.oauth_connect",
    targetId: conn.id,
    targetType: "integration",
    metadata: { appSlug: conn.appSlug, connectedAccountId },
  });

  return c.json({ ok: true });
});

/**
 * DELETE /api/integrations/:id
 * Disconnect (remove) an integration.
 */
API.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const conn = await IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);

  // Clean up the Foundry account if it exists
  const pdKey = await getPdApiKey(userId);
  if (pdKey && conn.connectedAccountId) {
    try {
      await FoundryClient.deleteAccount(pdKey, conn.connectedAccountId);
    } catch {
      // Non-fatal — the local record is what matters
    }
  }

  // Delete the credentials secret if it exists
  if (conn.credentialsRef) {
    await SecretStore.delete(userId, conn.credentialsRef);
  }

  const ok = await IntegrationRegistry.delete(conn.id, userId);

  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "integration.disconnect",
    targetId: conn.id,
    targetType: "integration",
    metadata: { appSlug: conn.appSlug },
  });

  return c.json({ ok });
});

// ----- Actions / Execution -----

/**
 * GET /api/integrations/:id/actions
 * List available actions for a connected integration.
 */
API.get("/:id/actions", async (c) => {
  const userId = c.get("userId") as string;
  const conn = await IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);

  const actions = await IntegrationRegistry.listCachedActions(conn.appSlug);
  return c.json({ actions });
});

/**
 * POST /api/integrations/:id/execute
 * Execute an action on a connected integration.
 *
 * Body:
 *   - actionKey: the action key (e.g. "slack-send-message")
 *   - input: parameters object
 */
API.post("/:id/execute", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = await requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const conn = await IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);
  if (conn.status !== "connected") {
    return c.json({ error: `Integration is not connected (status: ${conn.status})` }, 400);
  }

  const { actionKey, input } = (await c.req.json()) as {
    actionKey: string;
    input: Record<string, unknown>;
  };

  if (!actionKey) return c.json({ error: "actionKey required" }, 400);

  try {
    const accountId = conn.connectedAccountId;
    const { appSlug } = conn;
    let result;

    if (accountId) {
      // Use Foundry Connect API for OAuth-connected accounts
      result = await FoundryClient.executeAction(pdKey, appSlug, actionKey, input ?? {}, accountId, `lab_${userId}`);
    } else if (conn.credentialsRef) {
      // For API key-based integrations, retrieve the stored key and
      // pass it as `configured_props.api_key` — the Foundry-standard
      // name for the API key config prop in most Connect apps. The
      // user's input is merged on top so explicit overrides win.
      const storedKey = await SecretStore.get(userId, conn.credentialsRef);
      if (!storedKey) {
        return c.json({ error: "Stored credentials not found" }, 500);
      }
      result = await FoundryClient.executeAction(
        pdKey,
        appSlug,
        actionKey,
        { api_key: storedKey, ...(input ?? {}) },
        "",
        `lab_${userId}`,
      );
    } else {
      return c.json({ error: "No credentials or connected account. Provide credentials first." }, 400);
    }

    Audit.record({
      ownerId: userId,
      actor: "user",
      action: "integration.execute",
      targetId: conn.id,
      targetType: "integration",
      metadata: { appSlug: conn.appSlug, actionKey, success: result.status === "success" },
    });

    return c.json({ result });
  } catch (e: any) {
    return c.json({ error: `Execution failed: ${e?.message ?? String(e)}` }, 502);
  }
});

// ----- Foundry API Key Management -----

/**
 * GET /api/integrations/foundry/status
 * Check if Foundry API key is set and valid.
 */
API.get("/foundry/status", async (c) => {
  const userId = c.get("userId") as string;
  const key = await getPdApiKey(userId);
  if (!key) {
    return c.json({ configured: false, valid: false, message: "No Foundry API key configured" });
  }
  const valid = await FoundryClient.status(key);
  return c.json({
    configured: true,
    valid,
    message: valid ? "API key is valid" : "API key is invalid or expired",
  });
});

/**
 * PUT /api/integrations/foundry/key
 * Set or update the Foundry API key.
 */
API.put("/foundry/key", async (c) => {
  const userId = c.get("userId") as string;
  const { value } = (await c.req.json()) as { value: string };
  if (!value || value.length < 10) {
    return c.json({ error: "A valid Foundry API key is required (min 10 chars)" }, 400);
  }
  await SecretStore.set(userId, "foundry_api_key", value);
  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "integration.set_foundry_key",
    metadata: { length: value.length },
  });
  return c.json({ ok: true });
});

// ----- Stats / Dashboard -----

/**
 * GET /api/integrations/stats
 * Return counts per status for the dashboard.
 */
API.get("/stats", async (c) => {
  const userId = c.get("userId") as string;
  const byStatus = await IntegrationRegistry.countByStatus(userId);
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return c.json({ total, byStatus });
});

// ----- Foundry Connect (OAuth flow) -----
// Foundry only needs a single API key per user. The gateway handles the OAuth
// handshake and the callback token, so this endpoint simply reports whether a
// key is configured for the current user.

/**
 * GET /api/integrations/connect-config
 * Check if Foundry Connect is configured for the calling user.
 */
API.get("/connect-config", async (c) => {
  const userId = c.get("userId") as string;
  const key = await getPdApiKey(userId);
  return c.json({
    configured: !!key,
    hasProjectId: false,
    hasClientId: false,
    environment: "production",
  });
});

/**
 * POST /api/integrations/oauth-webhook
 * Called by Foundry Connect after a user completes the OAuth flow. The body
 * shape is loose — we only need app_slug, external_id (orgId we passed in as
 * `lab_${userId}`), and the connection id. Foundry doesn't sign these today,
 * so we trust the request and rely on the connection record for auth.
 */
API.post("/oauth-webhook", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  // Foundry passes back the orgId we set on the start call (lab_${userId}),
  // plus the provider name and the new connection id.
  const externalUserId: string = body.external_id ?? body.orgId ?? body.account?.external_id ?? "";
  const appSlug: string = body.app ?? body.provider ?? body.account?.app?.name_slug ?? "";
  const connectedAccountId: string = body.id ?? body.account?.id ?? body.connection_id ?? "";

  if (!appSlug || !externalUserId) {
    console.log("[integrations] oauth-webhook missing app/user:", JSON.stringify(body));
    return c.json({ received: true });
  }

  const userId = externalUserId.startsWith("lab_")
    ? externalUserId.slice(4)
    : externalUserId;

  const conn = await IntegrationRegistry.getByApp(userId, appSlug);
  if (!conn) {
    console.log(`[integrations] oauth-webhook no connection found for ${appSlug} / user ${userId}`);
    return c.json({ received: true, note: "no matching connection" });
  }

  await IntegrationRegistry.updateStatus(conn.id, userId, "connected", {
    connectedAccountId,
  });

  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "integration.oauth_connect",
    targetId: conn.id,
    targetType: "integration",
    metadata: { appSlug, connectedAccountId },
  });

  console.log(`[integrations] oauth-webhook connection ${conn.id} updated for ${appSlug}`);
  return c.json({ received: true, ok: true });
});

/**
 * POST /api/integrations/:id/verify-oauth
 * After the user returns from the Foundry OAuth flow, the frontend calls
 * this to check whether the OAuth account was connected. If the webhook
 * already processed it, the connection will have a connectedAccountId and
 * status "connected". If not, we look the connection up via Foundry.
 */
API.post("/:id/verify-oauth", async (c) => {
  const userId = c.get("userId") as string;
  const conn = await IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);

  if (conn.status === "connected" && conn.connectedAccountId) {
    return c.json({ connected: true, status: "connected", connectedAccountId: conn.connectedAccountId });
  }

  const pdKey = await getPdApiKey(userId);
  if (!pdKey) {
    return c.json({ connected: false, status: conn.status, message: "Foundry API key not configured" });
  }

  try {
    const connections = await FoundryClient.listConnections(pdKey);
    const matching = connections.find((x: any) => x.provider === conn.appSlug || x.app === conn.appSlug);

    if (matching) {
      const connectedAccountId = matching.id ?? matching.id;
      await IntegrationRegistry.updateStatus(conn.id, userId, "connected", { connectedAccountId });
      Audit.record({
        ownerId: userId,
        actor: "user",
        action: "integration.oauth_verify",
        targetId: conn.id,
        targetType: "integration",
        metadata: { appSlug: conn.appSlug, connectedAccountId, method: "list_connections" },
      });
      return c.json({ connected: true, status: "connected", connectedAccountId });
    }

    return c.json({ connected: false, status: "connecting", message: "No matching connection found yet. The webhook from Foundry may still be processing — try again in a few seconds." });
  } catch (e: any) {
    return c.json({ connected: false, status: conn.status, error: e?.message ?? String(e) });
  }
});

export { API as integrationsApi };
