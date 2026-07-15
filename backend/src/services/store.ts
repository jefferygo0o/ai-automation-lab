import { db } from "../db/index.ts";
import { nanoid } from "nanoid";

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
  secretRefs: Record<string, string>;
}

interface ServiceRow {
  id: string;
  owner_id: string;
  site_id: string | null;
  label: string;
  mode: string;
  entrypoint: string;
  workdir: string;
  local_port: number;
  is_public: number;
  status: string;
  pid: number | null;
  http_url: string;
  tcp_addr: string;
  env_vars: string;
  custom_domains: string;
  restart_count: number;
  created_at: number;
  updated_at: number;
}

function rowToService(r: ServiceRow): UserService {
  let envVars: Record<string, string> = {};
  try { envVars = JSON.parse(r.env_vars || "{}"); } catch {}
  let customDomains: string[] = [];
  try { customDomains = JSON.parse(r.custom_domains || "[]"); } catch {}
  let secretRefs: Record<string, string> = {};
  try { secretRefs = JSON.parse((r as any).secret_refs || "{}"); } catch {}
  return {
    id: r.id,
    ownerId: r.owner_id,
    siteId: r.site_id,
    label: r.label,
    mode: r.mode,
    entrypoint: r.entrypoint,
    workdir: r.workdir,
    localPort: r.local_port,
    isPublic: r.is_public === 1,
    status: r.status,
    pid: r.pid,
    httpUrl: r.http_url,
    tcpAddr: r.tcp_addr,
    envVars,
    customDomains,
    secretRefs,
    restartCount: r.restart_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const ServiceStore = {
  async list(ownerId: string): Promise<UserService[]> {
    const rows = await db
      .prepare("SELECT * FROM user_services WHERE owner_id = ? ORDER BY created_at DESC")
      .all(ownerId);
    return rows.map(rowToService);
  },

  async get(id: string, ownerId: string): Promise<UserService | null> {
    const row = await db
      .prepare("SELECT * FROM user_services WHERE id = ? AND owner_id = ?")
      .get(id, ownerId) as ServiceRow | undefined;
    return row ? rowToService(row) : null;
  },

  async getUnchecked(id: string): Promise<UserService | null> {
    const row = await db
      .prepare("SELECT * FROM user_services WHERE id = ?")
      .get(id) as ServiceRow | undefined;
    return row ? rowToService(row) : null;
  },

  async create(
    ownerId: string,
    opts: {
      label: string;
      mode: string;
      entrypoint: string;
      workdir?: string;
      localPort?: number;
      isPublic?: boolean;
      envVars?: Record<string, string>;
      siteId?: string;
      secretRefs?: Record<string, string>;
    },
  ): Promise<UserService> {
    const id = `svc_${nanoid(10)}`;
    const now = Date.now();
    const mode = opts.mode || "http";
    const localPort = opts.localPort || 0;
    const isPublic = opts.isPublic ? 1 : 0;

    await db.prepare(
      `INSERT INTO user_services (id, owner_id, site_id, label, mode, entrypoint, workdir, local_port, is_public, status, pid, http_url, tcp_addr, env_vars, custom_domains, restart_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', NULL, '', '', ?, '[]', 0, ?, ?)`
    ).run(
      id, ownerId, opts.siteId || null, opts.label, mode, opts.entrypoint,
      opts.workdir || "", localPort, isPublic,
      JSON.stringify(opts.envVars || {}),
      now, now,
    );
    return (await ServiceStore.get(id, ownerId))!;
  },

  async update(id: string, ownerId: string, fields: Partial<{
    label: string;
    mode: string;
    entrypoint: string;
    workdir: string;
    localPort: number;
    isPublic: boolean;
    status: string;
    pid: number | null;
    envVars: Record<string, string>;
    customDomains: string[];
    secretRefs: Record<string, string>;
  }>): Promise<UserService | null> {
    const existing = await ServiceStore.get(id, ownerId);
    if (!existing) return null;
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.label !== undefined) { sets.push("label = ?"); vals.push(fields.label); }
    if (fields.mode !== undefined) { sets.push("mode = ?"); vals.push(fields.mode); }
    if (fields.entrypoint !== undefined) { sets.push("entrypoint = ?"); vals.push(fields.entrypoint); }
    if (fields.workdir !== undefined) { sets.push("workdir = ?"); vals.push(fields.workdir); }
    if (fields.localPort !== undefined) { sets.push("local_port = ?"); vals.push(fields.localPort); }
    if (fields.isPublic !== undefined) { sets.push("is_public = ?"); vals.push(fields.isPublic ? 1 : 0); }
    if (fields.status !== undefined) { sets.push("status = ?"); vals.push(fields.status); }
    if (fields.pid !== undefined) { sets.push("pid = ?"); vals.push(fields.pid); }
    if (fields.envVars !== undefined) { sets.push("env_vars = ?"); vals.push(JSON.stringify(fields.envVars)); }
    if (fields.customDomains !== undefined) { sets.push("custom_domains = ?"); vals.push(JSON.stringify(fields.customDomains)); }
    if (fields.secretRefs !== undefined) { sets.push("secret_refs = ?"); vals.push(JSON.stringify(fields.secretRefs)); }
    if (sets.length === 0) return existing;
    sets.push("updated_at = ?");
    vals.push(Date.now(), id, ownerId);
    await db.prepare(`UPDATE user_services SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);
    return ServiceStore.get(id, ownerId);
  },

  async delete(id: string, ownerId: string): Promise<boolean> {
    // Remove custom domains too
    await db.prepare("DELETE FROM custom_domains WHERE service_id = ?").run(id);
    const r = await db.prepare("DELETE FROM user_services WHERE id = ? AND owner_id = ?").run(id, ownerId);
    return r.changes > 0;
  },

  async addCustomDomain(serviceId: string, domain: string): Promise<boolean> {
    const id = `dom_${nanoid(8)}`;
    try {
      await db.prepare(
        "INSERT INTO custom_domains (id, service_id, domain, created_at) VALUES (?, ?, ?, ?)"
      ).run(id, serviceId, domain, Date.now());
      // Also update the custom_domains JSON on the service row
      const row = await db.prepare("SELECT custom_domains FROM user_services WHERE id = ?").get(serviceId) as any;
      let domains: string[] = [];
      try { domains = JSON.parse(row?.custom_domains || "[]"); } catch {}
      domains.push(domain);
      await db.prepare("UPDATE user_services SET custom_domains = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(domains), Date.now(), serviceId);
      return true;
    } catch {
      return false;
    }
  },

  async removeCustomDomain(serviceId: string, domain: string): Promise<boolean> {
    await db.prepare("DELETE FROM custom_domains WHERE service_id = ? AND domain = ?").run(serviceId, domain);
    const row = await db.prepare("SELECT custom_domains FROM user_services WHERE id = ?").get(serviceId) as any;
    let domains: string[] = [];
    try { domains = JSON.parse(row?.custom_domains || "[]"); } catch {}
    domains = domains.filter((d: string) => d !== domain);
    await db.prepare("UPDATE user_services SET custom_domains = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(domains), Date.now(), serviceId);
    return true;
  },
};
