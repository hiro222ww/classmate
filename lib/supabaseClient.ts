// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

declare global {
  // eslint-disable-next-line no-var
  var __classmate_supabase__: SupabaseClient | undefined;
}

export const supabase =
  globalThis.__classmate_supabase__ ??
  createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__classmate_supabase__ = supabase;
}