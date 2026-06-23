import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
if (supabaseUrl && supabaseKey) {
  try {
    _supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log("[supabase] client initialized");
  } catch (e: any) {
    console.error("[supabase] failed to create client:", e?.message ?? e);
  }
} else {
  console.warn("[supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabaseAdmin = _supabaseAdmin;
