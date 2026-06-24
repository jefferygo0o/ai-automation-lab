import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import { encryptSecret, decryptSecret } from "./vault.ts";

export interface SecretMeta {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
}

interface Row {
  id: string;
  owner_id: string;
  name: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  created_at: number;
}

export const SecretStore = {
  /**
   * Normalize a secret name to the canonical form: UPPERCASE.
   * All secret names are stored uppercase so the lookup contract is
   * trivially case-insensitive — "pipedream_api_key" and "PIPEDREAM_API_KEY"
   * both resolve to the same row, and integration routes can use
   * `SecretStore.get(ownerId, "PIPEDREAM_API_KEY")` without gymnastics.
   */
  norm(name: string): string {
    return String(name ?? "").trim().toUpperCase();
  },

  async set(ownerId: string, name: string, value: string): Promise<SecretMeta> {
    // Canonicalise: store all secret names UPPERCASE. The collision guard
    // still uses LOWER() on both sides so any existing mixed-case row is
    // overwritten in place rather than orphaned.
    const canonical = SecretStore.norm(name);
    const existing = await db
      .prepare(
        `SELECT id FROM secrets WHERE owner_id = ? AND LOWER(name) = LOWER(?)`,
      )
      .get(ownerId, canonical) as { id: string } | undefined;
    const id = existing?.id ?? `sec_${nanoid(12)}`;
    const now = Date.now();
    const enc = encryptSecret(value);
    await db.prepare(
      `INSERT OR REPLACE INTO secrets (id, owner_id, name, ciphertext, iv, auth_tag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, ownerId, canonical, enc.ciphertext, enc.iv, enc.authTag, now);
    return { id, ownerId, name: canonical, createdAt: now };
  },

  async get(ownerId: string, name: string): Promise<string | null> {
    const row = await db
      .prepare(
        `SELECT ciphertext, iv, auth_tag FROM secrets WHERE owner_id = ? AND name = ?`,
      )
      .get(ownerId, SecretStore.norm(name)) as Pick<Row, "ciphertext" | "iv" | "auth_tag"> | undefined;
    if (!row) return null;
    return decryptSecret({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
    });
  },

  /**
   * Case-insensitive lookup. Returns the secret value regardless of the casing
   * the user typed when saving it (PIPEDREAM_API_KEY vs pipedream_api_key).
   */
  async getCI(ownerId: string, name: string): Promise<string | null> {
    const row = await db
      .prepare(
        `SELECT ciphertext, iv, auth_tag FROM secrets WHERE owner_id = ? AND LOWER(name) = LOWER(?)`,
      )
      .get(ownerId, name) as Pick<Row, "ciphertext" | "iv" | "auth_tag"> | undefined;
    if (!row) return null;
    return decryptSecret({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
    });
  },

  /** List all secrets for an owner with case-collapsed names (lowercased). */
  async listNamesLower(ownerId: string): Promise<string[]> {
    const rows = await db
      .prepare(`SELECT LOWER(name) AS n FROM secrets WHERE owner_id = ?`)
      .all(ownerId) as { n: string }[];
    return rows.map((r) => r.n);
  },

  async list(ownerId: string): Promise<SecretMeta[]> {
    return (await db
      .prepare(
        `SELECT id, owner_id, name, created_at FROM secrets WHERE owner_id = ? ORDER BY created_at DESC`,
      )
      .all(ownerId) as Pick<Row, "id" | "owner_id" | "name" | "created_at">[]).map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      name: r.name,
      createdAt: r.created_at,
    }));
  },

  async delete(ownerId: string, name: string): Promise<boolean> {
    const r = await db
      .prepare(`DELETE FROM secrets WHERE owner_id = ? AND LOWER(name) = LOWER(?)`)
      .run(ownerId, SecretStore.norm(name));
    return r.changes > 0;
  },
};
