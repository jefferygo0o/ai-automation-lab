import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";

export type AccessScope = "read" | "write" | "execute" | "admin";
export const ACCESS_SCOPES: AccessScope[] = ["read", "write", "execute", "admin"];

export interface ApiKeyRecord {
  id: string;
  ownerId: string;
  name: string;
  scopes: AccessScope[];
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rowToKey(row: any): ApiKeyRecord {
  let scopes: AccessScope[] = [];
  try { scopes = JSON.parse(row.scopes ?? "[]"); } catch {}
  return { id: row.id, ownerId: row.owner_id, name: row.name, scopes, createdAt: row.created_at, lastUsedAt: row.last_used_at ?? null, expiresAt: row.expires_at ?? null };
}

export const ApiKeys = {
  async create(ownerId: string, name: string, scopes: AccessScope[], expiresAt: number | null = null) {
    const clean = [...new Set(scopes)].filter((scope): scope is AccessScope => ACCESS_SCOPES.includes(scope));
    if (!clean.length) throw new Error("at least one scope is required");
    const id = `key_${nanoid(12)}`;
    const secret = `zal_${randomBytes(32).toString("base64url")}`;
    const now = Date.now();
    await db.prepare(`INSERT INTO api_keys (id, owner_id, name, key_hash, scopes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, ownerId, name.trim() || "API key", hash(secret), JSON.stringify(clean), now, expiresAt);
    return { key: secret, record: { id, ownerId, name: name.trim() || "API key", scopes: clean, createdAt: now, lastUsedAt: null, expiresAt } as ApiKeyRecord };
  },
  async list(ownerId: string) {
    return (await db.prepare("SELECT id, owner_id, name, scopes, last_used_at, created_at, expires_at FROM api_keys WHERE owner_id = ? ORDER BY created_at DESC").all(ownerId) as any[]).map((row) => ({ ...row, ownerId: row.owner_id, scopes: JSON.parse(row.scopes || "[]") }));
  },
  async revoke(id: string, ownerId: string) {
    return (await db.prepare("DELETE FROM api_keys WHERE id = ? AND owner_id = ?").run(id, ownerId)).changes > 0;
  },
  async authenticate(secret: string, required: AccessScope = "read"): Promise<{ ownerId: string; scopes: AccessScope[]; keyId: string } | null> {
    const row = await db.prepare(`SELECT * FROM api_keys WHERE key_hash = ?`).get(hash(secret)) as any;
    if (!row || (row.expires_at && row.expires_at < Date.now())) return null;
    let scopes: AccessScope[] = [];
    try { scopes = JSON.parse(row.scopes ?? "[]"); } catch {}
    const allowed = scopes.includes("admin") || scopes.includes(required) || (required === "read" && scopes.includes("write"));
    if (!allowed) return null;
    await db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).run(Date.now(), row.id);
    return { ownerId: row.owner_id, scopes, keyId: row.id };
  },
};

export function scopeForMethod(method: string): AccessScope {
  if (method === "GET" || method === "HEAD") return "read";
  if (method === "DELETE") return "write";
  return "write";
}
