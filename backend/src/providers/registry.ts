import { db } from "../db/index.ts";
import { randomUUID } from "node:crypto";

export interface ProviderRecord {
  id: string;
  ownerId: string;
  name: string;
  kind: "llm" | "integration" | "oauth" | "mcp";
  baseUrl: string;
  model: string;
  secretName: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

type ProviderRow = {
  id: string; owner_id: string; name: string; kind: string; base_url: string;
  model: string; secret_name: string; enabled: number; metadata_json: string;
  created_at: number; updated_at: number;
};

function map(row: ProviderRow): ProviderRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    kind: row.kind as ProviderRecord["kind"],
    baseUrl: row.base_url,
    model: row.model,
    secretName: row.secret_name,
    enabled: Boolean(row.enabled),
    metadata: JSON.parse(row.metadata_json || "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const ProviderRegistry = {
  async list(ownerId: string, kind?: ProviderRecord["kind"]): Promise<ProviderRecord[]> {
    const rows = kind
      ? await db.prepare("SELECT * FROM provider_registry WHERE owner_id = ? AND kind = ? ORDER BY name").all(ownerId, kind)
      : await db.prepare("SELECT * FROM provider_registry WHERE owner_id = ? ORDER BY name").all(ownerId);
    return (rows as ProviderRow[]).map(map);
  },
  async get(id: string, ownerId: string): Promise<ProviderRecord | null> {
    const row = await db.prepare("SELECT * FROM provider_registry WHERE id = ? AND owner_id = ?").get(id, ownerId) as ProviderRow | null;
    return row ? map(row) : null;
  },
  async upsert(input: Omit<ProviderRecord, "createdAt" | "updatedAt">): Promise<ProviderRecord> {
    const now = Date.now();
    await db.prepare(`INSERT INTO provider_registry
      (id, owner_id, name, kind, base_url, model, secret_name, enabled, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind,
      base_url = EXCLUDED.base_url, model = EXCLUDED.model, secret_name = EXCLUDED.secret_name,
      enabled = EXCLUDED.enabled, metadata_json = EXCLUDED.metadata_json, updated_at = EXCLUDED.updated_at`)
      .run(input.id, input.ownerId, input.name, input.kind, input.baseUrl, input.model, input.secretName, input.enabled ? 1 : 0, JSON.stringify(input.metadata), now, now);
    return (await this.get(input.id, input.ownerId))!;
  },
  async setEnabled(id: string, ownerId: string, enabled: boolean): Promise<boolean> {
    const result = await db.prepare("UPDATE provider_registry SET enabled = ?, updated_at = ? WHERE id = ? AND owner_id = ?").run(enabled ? 1 : 0, Date.now(), id, ownerId);
    return result.changes > 0;
  },
  async delete(id: string, ownerId: string): Promise<boolean> {
    const result = await db.prepare("DELETE FROM provider_registry WHERE id = ? AND owner_id = ?").run(id, ownerId);
    return result.changes > 0;
  },
  async create(ownerId: string, input: Partial<ProviderRecord>) {
    const id = input.id ?? `provider_${randomUUID()}`;
    return ProviderRegistry.upsert({ id, ownerId, name: input.name ?? "", kind: input.kind ?? "llm", baseUrl: input.baseUrl ?? "", secretName: input.secretName ?? "", model: input.model ?? "", metadata: input.metadata ?? {}, enabled: input.enabled ?? true });
  },
  async update(id: string, ownerId: string, input: Partial<ProviderRecord>) {
    const existing = await ProviderRegistry.get(id, ownerId);
    if (!existing) return null;
    return ProviderRegistry.upsert({ ...existing, ...input, id, ownerId });
  },
  async remove(id: string, ownerId: string) {
    return ProviderRegistry.delete(id, ownerId);
  },
};
