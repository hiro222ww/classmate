import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase admin env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }

  if (!cached) {
    cached = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return cached;
}

// ✅ 互換：既存コードが import { supabaseAdmin } from "@/lib/supabaseAdmin" でも動く
export const supabaseAdmin = getSupabaseAdmin();
