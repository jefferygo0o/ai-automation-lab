/**
 * Integration Registry — manages connected integrations and their credentials.
 *
 * Each integration connection stores:
 *   - The app slug (which Pipedream app it connects to)
 *   - Auth type (oauth, api_key, keys, none)
 *   - Credential reference (key into the secrets vault)
 *   - The Pipedream connected_account_id (for OAuth flows)
 *   - Status (disconnected, connecting, connected, error)
 *
 * The action cache stores the app's action/trigger schemas locally so the
 * frontend and agents can discover available actions without hitting Pipedream's API.
 */

import { nanoid } from "nanoid";
import type { PdApp } from "./pipedream.ts";
import { db } from "../db/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationConnection {
  id: string;
  ownerId: string;
  appSlug: string;
  appName: string;
  appDescription: string;
  authType: "oauth" | "api_key" | "keys" | "none";
  authDescription: string;
  logoUrl: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  credentialsRef: string | null;     // name of the secret holding credentials
  connectedAccountId: string | null;  // Pipedream account ID (for OAuth)
  categories: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CachedAction {
  id: string;
  appSlug: string;
  actionKey: string;
  name: string;
  description: string;
  type: "action" | "trigger";
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface CachedCatalogApp {
  id: string;
  ownerId: string;
  appSlug: string;
  name: string;
  description: string;
  authType: string;
  authDescription: string;
  actionCount: number;
  triggerCount: number;
  logoUrl: string;
  categories: string[];
  fetchedAt: number;
}

export interface SyncState {
  status: string;
  total: number;
  errorMessage: string | null;
  startedAt: number;
  completedAt: number | null;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface IntegrationRow {
  id: string;
  owner_id: string;
  app_slug: string;
  app_name: string;
  app_description: string;
  auth_type: string;
  auth_description: string;
  logo_url: string;
  status: string;
  credentials_ref: string | null;
  connected_account_id: string | null;
  categories: string;
  created_at: number;
  updated_at: number;
}

interface ActionRow {
  id: string;
  app_slug: string;
  action_key: string;
  name: string;
  description: string;
  type: string;
  input_schema: string;
  output_schema: string;
  created_at: number;
}

interface CatalogAppRow {
  id: string;
  owner_id: string;
  app_slug: string;
  name: string;
  description: string;
  auth_type: string;
  auth_description: string;
  action_count: number;
  trigger_count: number;
  logo_url: string;
  categories_json: string;
  fetched_at: number;
}

function rowToConnection(r: IntegrationRow): IntegrationConnection {
  return {
    id: r.id,
    ownerId: r.owner_id,
    appSlug: r.app_slug,
    appName: r.app_name,
    appDescription: r.app_description,
    authType: r.auth_type as IntegrationConnection["authType"],
    authDescription: r.auth_description,
    logoUrl: r.logo_url,
    status: r.status as IntegrationConnection["status"],
    credentialsRef: r.credentials_ref,
    connectedAccountId: r.connected_account_id,
    categories: safeJsonParse(r.categories, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToCatalogApp(r: CatalogAppRow): CachedCatalogApp {
  return {
    id: r.id,
    ownerId: r.owner_id,
    appSlug: r.app_slug,
    name: r.name,
    description: r.description,
    authType: r.auth_type,
    authDescription: r.auth_description,
    actionCount: r.action_count,
    triggerCount: r.trigger_count,
    logoUrl: r.logo_url,
    categories: safeJsonParse(r.categories_json, []),
    fetchedAt: r.fetched_at,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const IntegrationRegistry = {
  // ---- Connections CRUD ----

  async list(ownerId: string): Promise<IntegrationConnection[]> {
    return await (await db.prepare(
      `SELECT * FROM integration_connections WHERE owner_id = ? ORDER BY updated_at DESC`
    ).all(ownerId) as IntegrationRow[]).map(rowToConnection);
  },

  async get(id: string, ownerId: string): Promise<IntegrationConnection | null> {
    const r = await db.prepare(
      `SELECT * FROM integration_connections WHERE id = ? AND owner_id = ?`
    ).get(id, ownerId) as IntegrationRow | undefined;
    return r ? rowToConnection(r) : null;
  },

  async getByApp(ownerId: string, appSlug: string): Promise<IntegrationConnection | null> {
    const r = await db.prepare(
      `SELECT * FROM integration_connections WHERE owner_id = ? AND app_slug = ?`
    ).get(ownerId, appSlug) as IntegrationRow | undefined;
    return r ? rowToConnection(r) : null;
  },

  async create(
    ownerId: string,
    opts: {
      appSlug: string;
      appName: string;
      appDescription: string;
      authType: IntegrationConnection["authType"];
      authDescription: string;
      logoUrl: string;
      categories?: string[];
    },
  ): Promise<IntegrationConnection> {
    const id = `int_${nanoid(12)}`;
    const now = Date.now();
    const categories = JSON.stringify(opts.categories ?? []);
    await db.prepare(
      `INSERT INTO integration_connections
       (id, owner_id, app_slug, app_name, app_description, auth_type, auth_description,
        logo_url, status, credentials_ref, connected_account_id, categories, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', NULL, NULL, ?, ?, ?)`
    ).run(
      id, ownerId,
      opts.appSlug, opts.appName, opts.appDescription,
      opts.authType, opts.authDescription,
      opts.logoUrl, categories, now, now,
    );
    return (await this.get(id, ownerId))!;
  },

  async updateStatus(
    id: string,
    ownerId: string,
    status: IntegrationConnection["status"],
    extra?: { credentialsRef?: string; connectedAccountId?: string; error?: string },
  ): Promise<boolean> {
    const sets: string[] = ["status = ?"];
    const vals: (string | null)[] = [status];
    if (extra?.credentialsRef !== undefined) {
      sets.push("credentials_ref = ?");
      vals.push(extra.credentialsRef);
    }
    if (extra?.connectedAccountId !== undefined) {
      sets.push("connected_account_id = ?");
      vals.push(extra.connectedAccountId);
    }
    sets.push("updated_at = ?");
    vals.push(String(Date.now()), id, ownerId);
    const r = await db.prepare(
      `UPDATE integration_connections SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`
    ).run(...vals);
    return r.changes > 0;
  },

  async delete(id: string, ownerId: string): Promise<boolean> {
    const r = await db.prepare(
      `DELETE FROM integration_connections WHERE id = ? AND owner_id = ?`
    ).run(id, ownerId);
    return r.changes > 0;
  },

  // ---- Action cache ----

  async cacheActions(appSlug: string, actions: CachedAction[]): Promise<void> {
    // Remove stale entries for this app
    await db.prepare(`DELETE FROM integration_action_cache WHERE app_slug = ?`).run(appSlug);
    const now = Date.now();
    const insert = await db.prepare(
      `INSERT INTO integration_action_cache
       (id, app_slug, action_key, name, description, type, input_schema, output_schema, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const a of actions) {
      insert.run(
        `act_${nanoid(8)}`,
        appSlug,
        a.actionKey,
        a.name,
        a.description,
        a.type,
        JSON.stringify(a.inputSchema),
        JSON.stringify(a.outputSchema),
        now,
      );
    }
  },

  async listCachedActions(appSlug: string): Promise<CachedAction[]> {
    return await (await db.prepare(
      `SELECT * FROM integration_action_cache WHERE app_slug = ? ORDER BY type, name`
    ).all(appSlug) as ActionRow[]).map((r) => ({
      id: r.id,
      appSlug: r.app_slug,
      actionKey: r.action_key,
      name: r.name,
      description: r.description,
      type: r.type as "action" | "trigger",
      inputSchema: safeJsonParse(r.input_schema, {}),
      outputSchema: safeJsonParse(r.output_schema, {}),
    }));
  },

  async getCachedAction(appSlug: string, actionKey: string): Promise<CachedAction | null> {
    const r = await db.prepare(
      `SELECT * FROM integration_action_cache WHERE app_slug = ? AND action_key = ?`
    ).get(appSlug, actionKey) as ActionRow | undefined;
    if (!r) return null;
    return {
      id: r.id,
      appSlug: r.app_slug,
      actionKey: r.action_key,
      name: r.name,
      description: r.description,
      type: r.type as "action" | "trigger",
      inputSchema: safeJsonParse(r.input_schema, {}),
      outputSchema: safeJsonParse(r.output_schema, {}),
    };
  },

  /** List all unique app slugs that have cached actions. */
  async listCachedApps(): Promise<string[]> {
    return await (await db.prepare(
      `SELECT DISTINCT app_slug FROM integration_action_cache ORDER BY app_slug`
    ).all() as { app_slug: string }[]).map((r) => r.app_slug);
  },

  /** Get cache timestamp for an app (most recent action). */
  async getCacheTimestamp(appSlug: string): Promise<number | null> {
    const r = await db.prepare(
      `SELECT MAX(created_at) as ts FROM integration_action_cache WHERE app_slug = ?`
    ).get(appSlug) as { ts: number } | undefined;
    return r?.ts ?? null;
  },

  /** Count connections by status for dashboard. */
  async countByStatus(ownerId: string): Promise<Record<string, number>> {
    const rows = await db.prepare(
      `SELECT status, COUNT(*) as count FROM integration_connections
       WHERE owner_id = ? GROUP BY status`
    ).all(ownerId) as { status: string; count: number }[];
    const counts: Record<string, number> = { disconnected: 0, connecting: 0, connected: 0, error: 0 };
    for (const r of rows) counts[r.status] = r.count;
    return counts;
  },

  // ---- Catalog App Cache ----

  async getCachedApps(ownerId: string): Promise<CachedCatalogApp[]> {
    return await (await db.prepare(
      `SELECT * FROM catalog_app_cache WHERE owner_id = ? ORDER BY name ASC`
    ).all(ownerId) as CatalogAppRow[]).map(rowToCatalogApp);
  },

  async getCachedAppsCount(ownerId: string): Promise<number> {
    const r = await db.prepare(
      `SELECT COUNT(*) as count FROM catalog_app_cache WHERE owner_id = ?`
    ).get(ownerId) as { count: number };
    return r?.count ?? 0;
  },

  async getCachedAppsPage(ownerId: string, page: number, perPage: number): Promise<CachedCatalogApp[]> {
    const offset = (page - 1) * perPage;
    return await (await db.prepare(
      `SELECT * FROM catalog_app_cache WHERE owner_id = ? ORDER BY name ASC LIMIT ? OFFSET ?`
    ).all(ownerId, perPage, offset) as CatalogAppRow[]).map(rowToCatalogApp);
  },

  async searchCachedApps(ownerId: string, query: string, page: number, perPage: number): Promise<{ apps: CachedCatalogApp[]; total: number }> {
    const offset = (page - 1) * perPage;
    const like = `%${query}%`;
    const total = await (await db.prepare(
      `SELECT COUNT(*) as count FROM catalog_app_cache WHERE owner_id = ? AND (name LIKE ? OR description LIKE ? OR app_slug LIKE ?)`
    ).get(ownerId, like, like, like) as { count: number })?.count ?? 0;
    const rows = await db.prepare(
      `SELECT * FROM catalog_app_cache WHERE owner_id = ? AND (name LIKE ? OR description LIKE ? OR app_slug LIKE ?) ORDER BY name ASC LIMIT ? OFFSET ?`
    ).all(ownerId, like, like, like, perPage, offset) as CatalogAppRow[];
    return { apps: rows.map(rowToCatalogApp), total };
  },

  async getCachedAppBySlug(ownerId: string, slug: string): Promise<CachedCatalogApp | null> {
    const r = await db.prepare(
      `SELECT * FROM catalog_app_cache WHERE owner_id = ? AND app_slug = ?`
    ).get(ownerId, slug) as CatalogAppRow | undefined;
    return r ? rowToCatalogApp(r) : null;
  },

  async getCachedCategories(ownerId: string): Promise<string[]> {
    const rows = await db.prepare(
      `SELECT DISTINCT categories_json FROM catalog_app_cache WHERE owner_id = ?`
    ).all(ownerId) as { categories_json: string }[];
    const cats = new Set<string>();
    for (const r of rows) {
      const parsed = safeJsonParse<string[]>(r.categories_json, []);
      if (Array.isArray(parsed)) {
        for (const c of parsed) cats.add(c);
      }
    }
    return Array.from(cats).sort();
  },

  async cacheAppCatalog(ownerId: string, apps: PdApp[]): Promise<void> {
    const now = Date.now();
    const batch = apps.map((a) => ({
      id: `cat_${nanoid(8)}`,
      app_slug: a.name_slug,
      name: a.name,
      description: a.description,
      auth_type: a.auth_type,
      auth_description: a.auth_description,
      action_count: a.action_count ?? 0,
      trigger_count: a.trigger_count ?? 0,
      logo_url: a.logo_url,
      categories_json: JSON.stringify(a.categories ?? []),
      fetched_at: now,
    }));

    if (batch.length === 0) return;

    await db.transaction(async () => {
      for (const item of batch) {
        await db.prepare(
          `INSERT INTO catalog_app_cache
           (id, owner_id, app_slug, name, description, auth_type, auth_description,
            action_count, trigger_count, logo_url, categories_json, fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`
        ).run(
          item.id,
          ownerId,
          item.app_slug,
          item.name,
          item.description,
          item.auth_type,
          item.auth_description,
          item.action_count,
          item.trigger_count,
          item.logo_url,
          item.categories_json,
          item.fetched_at,
        );
      }
    });
  },

  async getCatalogSyncState(ownerId: string): Promise<{ status: string; total: number; errorMessage: string | null; startedAt: number; completedAt: number | null } | null> {
    const r = await db.prepare(
      `SELECT * FROM catalog_sync_state WHERE owner_id = ?`
    ).get(ownerId) as { owner_id: string; status: string; total: number; error_message: string | null; started_at: number; completed_at: number | null } | undefined;
    if (!r) return null;
    return {
      status: r.status,
      total: r.total,
      errorMessage: r.error_message,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    };
  },

  async updateCatalogSyncState(ownerId: string, status: string, extra?: { total?: number; errorMessage?: string }): Promise<void> {
    const existing = await db.prepare(`SELECT * FROM catalog_sync_state WHERE owner_id = ?`).get(ownerId);
    const now = Date.now();
    if (existing) {
      const sets: string[] = ["status = ?", "started_at = ?"];
      const vals: (string | number | null)[] = [status, now];
      if (extra?.total !== undefined) { sets.push("total = ?"); vals.push(extra.total); }
      if (extra?.errorMessage !== undefined) { sets.push("error_message = ?"); vals.push(extra.errorMessage); }
      if (status === "idle" || status === "complete" || status === "error") { sets.push("completed_at = ?"); vals.push(now); }
      vals.push(ownerId);
      await db.prepare(`UPDATE catalog_sync_state SET ${sets.join(", ")} WHERE owner_id = ?`).run(...vals);
    } else {
      await db.prepare(
        `INSERT INTO catalog_sync_state (owner_id, status, total, error_message, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(ownerId, status, extra?.total ?? 0, extra?.errorMessage ?? null, now, status === "complete" ? now : null);
    }
  },

  async isCacheFresh(ownerId: string, ttlMs: number): Promise<boolean> {
    const r = await db.prepare(
      `SELECT MAX(fetched_at) as ts FROM catalog_app_cache WHERE owner_id = ?`
    ).get(ownerId) as { ts: number | null } | undefined;
    if (!r?.ts) return false;
    return (Date.now() - r.ts) < ttlMs;
  },
};

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
