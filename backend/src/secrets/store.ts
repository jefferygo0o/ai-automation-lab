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
  set(ownerId: string, name: string, value: string): SecretMeta {
    const id = `sec_${nanoid(12)}`;
    const now = Date.now();
    const enc = encryptSecret(value);
    db.prepare(
      `INSERT OR REPLACE INTO secrets (id, owner_id, name, ciphertext, iv, auth_tag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, ownerId, name, enc.ciphertext, enc.iv, enc.authTag, now);
    return { id, ownerId, name, createdAt: now };
  },

  get(ownerId: string, name: string): string | null {
    const row = db.prepare(
      `SELECT ciphertext, iv, auth_tag FROM secrets WHERE owner_id = ? AND name = ?`
    ).get(ownerId, name) as Pick<Row, "ciphertext" | "iv" | "auth_tag"> | undefined;
    if (!row) return null;
    return decryptSecret({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
    });
  },

  list(ownerId: string): SecretMeta[] {
    return (db.prepare(
      `SELECT id, owner_id, name, created_at FROM secrets WHERE owner_id = ? ORDER BY created_at DESC`
    ).all(ownerId) as Pick<Row, "id" | "owner_id" | "name" | "created_at">[]).map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      name: r.name,
      createdAt: r.created_at,
    }));
  },

  delete(ownerId: string, name: string): boolean {
    const r = db.prepare(
      `DELETE FROM secrets WHERE owner_id = ? AND name = ?`
    ).run(ownerId, name);
    return r.changes > 0;
  },
};
