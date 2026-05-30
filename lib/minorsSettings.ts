import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CACHE_MS = 60_000;

let cachedMinorsEnabled: { value: boolean; at: number } | null = null;

/** 明示的 true の場合のみ ON。それ以外は OFF。 */
export function parseMinorsEnabledValue(value: unknown): boolean {
  if (value === true) return true;

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (obj.enabled === true) return true;
    if (obj.minors_enabled === true) return true;
  }

  return false;
}

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
      cachedMinorsEnabled = { value: false, at: Date.now() };
      return false;
    }

    const value = parseMinorsEnabledValue(data?.value ?? null);
    cachedMinorsEnabled = { value, at: Date.now() };
    return value;
  } catch {
    cachedMinorsEnabled = { value: false, at: Date.now() };
    return false;
  }
}
