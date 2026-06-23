import { timingSafeEqual } from "node:crypto";
import { db } from "../db/index.ts";
import { supabaseAdmin } from "./supabase.ts";

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

export async function createUser(email: string, password: string): Promise<{ id: string; email: string } | null> {
  if (!supabaseAdmin) {
    console.error("[auth] Supabase not configured");
    return null;
  }
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    console.error("[auth] Supabase create user failed:", error?.message);
    return null;
  }
  const uid = data.user.id;
  const now = Date.now();
  // Upsert into our users table — id is the Supabase Auth UUID
  await db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, '', 'user', ?)`
  ).run(uid, email.toLowerCase(), now);
  return { id: uid, email: email.toLowerCase() };
}

export async function login(email: string, password: string): Promise<Session | null> {
  if (!supabaseAdmin) {
    console.error("[auth] Supabase not configured");
    return null;
  }
  // Sign in with Supabase
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: email.toLowerCase(),
    password,
  });
  if (error || !data.session) {
    return null;
  }
  return {
    token: data.session.access_token,
    userId: data.user.id,
    expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : Date.now() + 3600000,
  };
}

export async function authenticateBearer(authHeader: string | undefined): Promise<{ userId: string } | null> {
  if (!authHeader || !supabaseAdmin) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m || !m[1]) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(m[1]);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

export function deleteSession(token: string): void {
  // Supabase sessions are JWT-based; we don't store them in our DB.
  // The token will expire naturally. No-op for now.
}

export async function findUserById(id: string): Promise<{ id: string; email: string; role: string } | undefined> {
  return await db.prepare(
    `SELECT id, email, role FROM users WHERE id = ?`
  ).get(id) as { id: string; email: string; role: string } | undefined;
}

export async function findUserByEmail(email: string): Promise<{ id: string; email: string } | undefined> {
  return await db.prepare(
    `SELECT id, email FROM users WHERE email = ?`
  ).get(email.toLowerCase()) as { id: string; email: string } | undefined;
}
