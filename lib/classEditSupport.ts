import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Detect whether display_name / cover_path migrations are applied.
 * Used to hide edit UI until an operator applies the SQL migration.
 */
export async function isClassPresentationEditSupported(
  sb: SupabaseClient
): Promise<boolean> {
  const { error } = await sb
    .from("classes")
    .select("display_name, cover_path")
    .limit(1);
  if (!error) return true;
  const msg = String(error.message ?? "").toLowerCase();
  // Missing column → feature off. Other errors also keep UI hidden.
  if (msg.includes("display_name") || msg.includes("cover_path")) return false;
  if (msg.includes("column") || msg.includes("does not exist")) return false;
  return false;
}
