import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const candidate = scryptSync(plain, salt, 64);
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

export function createUser(email: string, password: string): { id: string; email: string } {
  const id = `usr_${nanoid(12)}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'user', ?)`
  ).run(id, email.toLowerCase(), hashPassword(password), now);
  return { id, email: email.toLowerCase() };
}

export function findUserByEmail(email: string) {
  return db.prepare(
    `SELECT id, email, password_hash FROM users WHERE email = ?`
  ).get(email.toLowerCase()) as { id: string; email: string; password_hash: string } | undefined;
}

export function findUserById(id: string) {
  return db.prepare(
    `SELECT id, email, role FROM users WHERE id = ?`
  ).get(id) as { id: string; email: string; role: string } | undefined;
}

export function createSession(userId: string): Session {
  const token = `tok_${nanoid(32)}`;
  const expires = Date.now() + SESSION_TTL_MS;
  db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(
    token, userId, Date.now(), expires,
  );
  return { token, userId, expiresAt: expires };
}

export function deleteSession(token: string): void {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function authenticateBearer(authHeader: string | undefined): { userId: string } | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m || !m[1]) return null;
  const row = db.prepare(
    `SELECT user_id, expires_at FROM sessions WHERE token = ?`
  ).get(m[1]) as { user_id: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    deleteSession(m[1]);
    return null;
  }
  return { userId: row.user_id };
}

export function login(email: string, password: string): Session | null {
  const u = findUserByEmail(email);
  if (!u) return null;
  if (!verifyPassword(password, u.password_hash)) return null;
  return createSession(u.id);
}
