/**
 * Server-side age policy (reads app_settings / user_profiles).
 * Client Components must import from `@/lib/agePolicyRules` instead.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAgeFromBirthDate } from "@/lib/age";
import { parseMinorsEnabledValue } from "@/lib/minorsSettings";
import { clearMinorsEnabledCache } from "@/lib/minorsSettings";

export { getMinorsEnabled } from "@/lib/minorsSettings";
import {
  ageModeFromLegacyMinors,
  parseAgeModeValue,
  isProductionAgeLocked,
  type AgeMode,
} from "@/lib/agePolicyRules";

export * from "@/lib/agePolicyRules";

const CACHE_MS = 60_000;
let cachedAgePolicy: { mode: AgeMode; at: number } | null = null;

export function clearAgePolicyCache() {
  cachedAgePolicy = null;
  clearMinorsEnabledCache();
}

export async function getEffectiveAgeMode(): Promise<AgeMode> {
  if (cachedAgePolicy && Date.now() - cachedAgePolicy.at < CACHE_MS) {
    return cachedAgePolicy.mode;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["age_mode", "minors_enabled"]);

    if (error) {
      cachedAgePolicy = { mode: "post_high_school_only", at: Date.now() };
      return "post_high_school_only";
    }

    let mode: AgeMode | null = null;
    let minorsEnabled = false;

    for (const row of data ?? []) {
      if (row.key === "age_mode") {
        mode = parseAgeModeValue(row.value);
      }
      if (row.key === "minors_enabled") {
        minorsEnabled = parseMinorsEnabledValue(row.value);
      }
    }

    const resolved =
      mode ?? ageModeFromLegacyMinors(minorsEnabled) ?? "post_high_school_only";

    const effectiveMode =
      minorsEnabled && resolved === "post_high_school_only"
        ? "minor_separated_test"
        : resolved;

    cachedAgePolicy = { mode: effectiveMode, at: Date.now() };
    return effectiveMode;
  } catch {
    cachedAgePolicy = { mode: "post_high_school_only", at: Date.now() };
    return "post_high_school_only";
  }
}

export async function isMinorsRegistrationAllowed(): Promise<boolean> {
  const mode = await getEffectiveAgeMode();
  return mode !== "post_high_school_only";
}

export async function getProfileAge(
  deviceId: string,
  userId?: string | null
): Promise<number | null> {
  const normalizedUserId = String(userId ?? "").trim();

  if (normalizedUserId) {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select("birth_date")
      .eq("user_id", normalizedUserId)
      .maybeSingle();

    if (!error && data) {
      return getAgeFromBirthDate(String(data.birth_date ?? ""));
    }
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("birth_date")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error || !data) return null;
  return getAgeFromBirthDate(String(data.birth_date ?? ""));
}
