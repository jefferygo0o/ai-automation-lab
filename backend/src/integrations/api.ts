/**
 * Integrations API routes.
 *
 * Mounted under /api/integrations in the main API server.
 * Provides endpoints for:
 *   - Browsing the Pipedream app catalog (with search)
 *   - Connecting/disconnecting integrations
 *   - Listing and executing integration actions
 *   - Syncing the action cache
 */

import { Hono } from "hono";
import { PipedreamClient } from "./pipedream.ts";
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
 * Get the user's Pipedream API key.
 * Resolution order:
 *   1. Process env (PIPEDREAM_API_KEY) — useful for self-hosted / CI.
 *   2. Secrets DB (case-insensitive lookup of "pipedream_api_key").
 * Either source is accepted; the env var wins when present.
 */
function getPdApiKey(ownerId: string): string | null {
  const envKey = process.env.PIPEDREAM_API_KEY?.trim();
  if (envKey && envKey.length > 0) return envKey;
  return SecretStore.getCI(ownerId, "pipedream_api_key");
}

/** Reusable guard — returns 400 if no PD key set. */
function requiresPdKey(ownerId: string, c: any): string | null {
  const key = getPdApiKey(ownerId);
  if (!key) {
    c.status(400);
    return null;
  }
  return key;
}

/** Strip the full connection when returning from the API. */
function sanitizeConn(c: IntegrationConnection) {
  const { credentialsRef, ...rest } = c;
  return { ...rest, hasCredentials: !!credentialsRef };
}

function pdKeyMissingPayload(ownerId: string) {
  const existing = SecretStore.list(ownerId).map((s) => s.name);
  return {
    error:
      "Pipedream API key not configured. Save it as a secret named 'pipedream_api_key' on the Secrets page, or set the PIPEDREAM_API_KEY environment variable on the server.",
    hint: "Secret lookup is case-insensitive, so any case works.",
    yourSecrets: existing,
  };
}

// ---------------------------------------------------------------------------
// Catalog Cache — background sync helper
// ---------------------------------------------------------------------------

/**
 * Fetch the full Pipedream catalog and cache it locally.
 * Updates sync state so the UI can show progress.
 */
async function syncCatalogFromPd(ownerId: string, pdKey: string): Promise<number> {
  if (syncLocks.has(ownerId)) {
    console.log("[sync] skipping — sync already in progress for", ownerId);
    return 0;
  }
  syncLocks.add(ownerId);
  console.log("[sync] starting sync for", ownerId);
  IntegrationRegistry.updateCatalogSyncState(ownerId, "syncing", { total: 0 });
  try {
    const apps = await PipedreamClient.listApps(pdKey);
    console.log("[sync] Pipedream listApps returned", apps.length, "apps");
    IntegrationRegistry.cacheAppCatalog(ownerId, apps);
    IntegrationRegistry.updateCatalogSyncState(ownerId, "complete", { total: apps.length });
    console.log("[sync] complete for", ownerId, "(" + apps.length + " apps)");
    return apps.length;
  } catch (e: any) {
    console.error("[sync] error for", ownerId + ":", e?.message ?? String(e));
    IntegrationRegistry.updateCatalogSyncState(ownerId, "error", {
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
 * Force a full re-sync of the Pipedream app catalog into the local cache.
 */
API.post("/catalog/sync", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = requiresPdKey(userId, c);
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
  const pdKey = requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  try {
    const count = IntegrationRegistry.getCachedAppsCount(userId);
    const fresh = IntegrationRegistry.isCacheFresh(userId, CACHE_TTL_MS);

    // Never block on Pipedream — return cached data immediately.
    // If the cache is empty or stale, trigger a background refresh.
    if (count === 0 || !fresh) {
      syncCatalogFromPd(userId, pdKey).catch(e => console.error("[integrations] sync error:", e?.message ?? String(e)));
    }

    const categories = IntegrationRegistry.getCachedCategories(userId);
    const syncState = IntegrationRegistry.getCatalogSyncState(userId);

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
 * Browse the Pipedream app catalog from the local cache.
 * Supports ?q=search&page=&per_page=&category=
 * Auto-triggers background sync if cache is stale.
 */
API.get("/catalog", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const query = c.req.query("q")?.trim() ?? "";
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(c.req.query("per_page") ?? 50)));
  const category = c.req.query("category")?.toLowerCase() ?? "";

  try {
    const count = IntegrationRegistry.getCachedAppsCount(userId);
    const fresh = IntegrationRegistry.isCacheFresh(userId, CACHE_TTL_MS);

    // Never block on Pipedream — return cached data immediately.
    // If the cache is empty or stale, trigger a background refresh.
    if (count === 0 || !fresh) {
      syncCatalogFromPd(userId, pdKey).catch(e => console.error("[integrations] sync error:", e?.message ?? String(e)));
    }

    // Get connected slugs
    const connected = new Set(
      IntegrationRegistry.list(userId).map((i) => i.appSlug),
    );

    let apps: CachedCatalogApp[];
    let total: number;

    if (query) {
      const result = IntegrationRegistry.searchCachedApps(userId, query, 1, 10000);
      apps = result.apps;
      total = result.total;
    } else {
      apps = IntegrationRegistry.getCachedApps(userId);
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
      sync_state: (() => {
        const s = IntegrationRegistry.getCatalogSyncState(userId);
        return s ? { status: s.status, total: s.total } : null;
      })(),
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
  const pdKey = requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const slug = c.req.param("slug");

  try {
    // Check cache first
    const cached = IntegrationRegistry.listCachedActions(slug);
    const cacheTs = IntegrationRegistry.getCacheTimestamp(slug);
    const isFresh = cacheTs && (Date.now() - cacheTs) < CACHE_TTL_MS;

    let app: any;
    let components = cached;

    if (isFresh && cached.length > 0) {
      // Use cached data — get basic app info from the first entry
      const conn = IntegrationRegistry.getByApp(userId, slug);
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
      // Fetch from Pipedream and cache
      const result = await PipedreamClient.getApp(pdKey, slug);
      app = result.app;
      components = result.components.map((comp: any) => ({
        id: comp.id,
        appSlug: slug,
        actionKey: comp.key,
        name: comp.name,
        description: comp.description,
        type: comp.type,
        inputSchema: comp.input_schema,
        outputSchema: comp.output_schema ?? {},
      }));
      IntegrationRegistry.cacheActions(slug, components);
    }

    const connected = !!(IntegrationRegistry.getByApp(userId, slug));

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
  const pdKey = requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const slug = c.req.param("slug");
  try {
    const result = await PipedreamClient.getApp(pdKey, slug);
    const components = result.components.map((comp: any) => ({
      id: comp.id,
      appSlug: slug,
      actionKey: comp.key,
      name: comp.name,
      description: comp.description,
      type: comp.type,
      inputSchema: comp.input_schema,
      outputSchema: comp.output_schema ?? {},
    }));
    IntegrationRegistry.cacheActions(slug, components);
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
API.get("/", (c) => {
  const userId = c.get("userId") as string;
  const connections = IntegrationRegistry.list(userId);
  return c.json({ connections: connections.map(sanitizeConn) });
});

/**
 * POST /api/integrations/connect/:slug
 * Create a new integration connection for an app.
 * Body can include optional `credentials` (an API key for api_key apps).
 */
API.post("/connect/:slug", async (c) => {
  const userId = c.get("userId") as string;
  const pdKey = requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const slug = c.req.param("slug");

  // Check if already connected
  const existing = IntegrationRegistry.getByApp(userId, slug);
  if (existing) {
    return c.json({ error: "Already connected", connection: sanitizeConn(existing) }, 409);
  }

  // Fetch app details from Pipedream
  try {
    const { app, components } = await PipedreamClient.getApp(pdKey, slug);

    // Cache the components
    const cached = components.map((comp) => ({
      id: comp.id,
      appSlug: slug,
      actionKey: comp.key,
      name: comp.name,
      description: comp.description,
      type: comp.type,
      inputSchema: comp.input_schema ?? {},
      outputSchema: comp.output_schema ?? {},
    }));
    IntegrationRegistry.cacheActions(slug, cached);

    // Create the connection record
    const conn = IntegrationRegistry.create(userId, {
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

    return c.json({ connection: sanitizeConn(conn) });
  } catch (e: any) {
    // If Pipedream fetch fails, still allow a minimal connection
    const conn = IntegrationRegistry.create(userId, {
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
  const conn = IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);

  const { value } = (await c.req.json()) as { value: string };
  const refName = `int_cred_${conn.appSlug}`;

  // Store as a secret
  SecretStore.set(userId, refName, value);

  IntegrationRegistry.updateStatus(conn.id, userId, "connected", {
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
 * Record a Pipedream connected_account_id after OAuth flow.
 */
API.put("/:id/oauth", async (c) => {
  const userId = c.get("userId") as string;
  const conn = IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);

  const { connectedAccountId } = (await c.req.json()) as { connectedAccountId: string };
  IntegrationRegistry.updateStatus(conn.id, userId, "connected", {
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
  const conn = IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);

  // Clean up the Pipedream account if it exists
  const pdKey = getPdApiKey(userId);
  if (pdKey && conn.connectedAccountId) {
    try {
      await PipedreamClient.deleteAccount(pdKey, conn.connectedAccountId);
    } catch {
      // Non-fatal — the local record is what matters
    }
  }

  // Delete the credentials secret if it exists
  if (conn.credentialsRef) {
    SecretStore.delete(userId, conn.credentialsRef);
  }

  const ok = IntegrationRegistry.delete(conn.id, userId);

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
API.get("/:id/actions", (c) => {
  const userId = c.get("userId") as string;
  const conn = IntegrationRegistry.get(c.req.param("id"), userId);
  if (!conn) return c.json({ error: "not found" }, 404);

  const actions = IntegrationRegistry.listCachedActions(conn.appSlug);
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
  const pdKey = requiresPdKey(userId, c);
  if (!pdKey) return c.json(pdKeyMissingPayload(userId), 400);

  const conn = IntegrationRegistry.get(c.req.param("id"), userId);
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
    let result;

    if (accountId) {
      // Use Pipedream Connect API for OAuth-connected accounts
      result = await PipedreamClient.executeAction(pdKey, actionKey, input ?? {}, accountId);
    } else if (conn.credentialsRef) {
      // For API key-based integrations, retrieve the key and pass directly
      const storedKey = SecretStore.get(userId, conn.credentialsRef);
      if (!storedKey) {
        return c.json({ error: "Stored credentials not found" }, 500);
      }
      // Try the Pipedream API with the stored credentials as the API key
      result = await PipedreamClient.executeAction(pdKey, actionKey, {
        ...(input ?? {}),
        apiKey: storedKey,
      }, "");
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

// ----- Pipedream API Key Management -----

/**
 * GET /api/integrations/pipedream/status
 * Check if Pipedream API key is set and valid.
 */
API.get("/pipedream/status", async (c) => {
  const userId = c.get("userId") as string;
  const key = getPdApiKey(userId);
  if (!key) {
    return c.json({ configured: false, valid: false, message: "No Pipedream API key configured" });
  }
  const valid = await PipedreamClient.ping(key);
  return c.json({
    configured: true,
    valid,
    message: valid ? "API key is valid" : "API key is invalid or expired",
  });
});

/**
 * PUT /api/integrations/pipedream/key
 * Set or update the Pipedream API key.
 */
API.put("/pipedream/key", async (c) => {
  const userId = c.get("userId") as string;
  const { value } = (await c.req.json()) as { value: string };
  if (!value || value.length < 10) {
    return c.json({ error: "A valid Pipedream API key is required (min 10 chars)" }, 400);
  }
  SecretStore.set(userId, "pipedream_api_key", value);
  Audit.record({
    ownerId: userId,
    actor: "user",
    action: "integration.set_pipedream_key",
    metadata: { length: value.length },
  });
  return c.json({ ok: true });
});

// ----- Stats / Dashboard -----

/**
 * GET /api/integrations/stats
 * Return counts per status for the dashboard.
 */
API.get("/stats", (c) => {
  const userId = c.get("userId") as string;
  const byStatus = IntegrationRegistry.countByStatus(userId);
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return c.json({ total, byStatus });
});

export { API as integrationsApi };
