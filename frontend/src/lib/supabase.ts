import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

let _client: SupabaseClient | null = null;

/**
 * Returns a Supabase client initialised with the anon key.
 *
 * The client stores the user's JWT (already a Supabase access_token from
 * `/api/auth/login`) so Realtime subscriptions respect RLS.
 *
 * Call `setSupabaseSession(token)` after login to attach the JWT.
 */
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return _client;
}

/**
 * Attach a Supabase JWT so Realtime (and PostgREST) calls are authenticated.
 * The token is the same `access_token` the backend already returns from login.
 */
export async function setSupabaseSession(accessToken: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  await client.auth.setSession({ access_token: accessToken, refresh_token: "" });
}
