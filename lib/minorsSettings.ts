import { parseMinorsEnabledValue } from "@/lib/agePolicyRules";

export { parseMinorsEnabledValue } from "@/lib/agePolicyRules";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CACHE_MS = 60_000;

let cachedMinorsEnabled: { value: boolean; at: number } | null = null;

export function clearMinorsEnabledCache() {
  cachedMinorsEnabled = null;
}

/** DB 取得失敗時も false（未成年登録 OFF） */
export async function getMinorsEnabled(): Promise<boolean> {
  if (cachedMinorsEnabled && Date.now() - cachedMinorsEnabled.at < CACHE_MS) {
    return cachedMinorsEnabled.value;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "minors_enabled")
      .maybeSingle();

    if (error) {
      console.warn("[minors-settings] read failed", error.message);
      cachedMinorsEnabled = { value: false, at: Date.now() };
      return false;
    }

    const value = parseMinorsEnabledValue(data?.value ?? null);
    cachedMinorsEnabled = { value, at: Date.now() };
    return value;
  } catch (e) {
    console.warn("[minors-settings] read error", e);
    cachedMinorsEnabled = { value: false, at: Date.now() };
    return false;
  }
}
