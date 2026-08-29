/**
 * Server-side age policy (reads app_settings / user_profiles).
 * Client Components must import from `@/lib/agePolicyRules` instead.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseMinorsEnabledValue } from "@/lib/minorsSettings";
import { clearMinorsEnabledCache } from "@/lib/minorsSettings";
import { resolveEffectiveProfileAge } from "@/lib/profileClient";

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

    // Minors OFF is authoritative: never keep a permissive age_mode around.
    if (!minorsEnabled) {
      cachedAgePolicy = { mode: "post_high_school_only", at: Date.now() };
      return "post_high_school_only";
    }

    const resolved =
      mode ?? ageModeFromLegacyMinors(minorsEnabled) ?? "post_high_school_only";

    const effectiveMode =
      resolved === "post_high_school_only"
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
  const selectCols =
    "birth_date, declared_age, declared_age_as_of, display_name, device_id";
  const normalizedUserId = String(userId ?? "").trim();

  if (normalizedUserId) {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select(selectCols)
      .eq("user_id", normalizedUserId)
      .maybeSingle();

    if (!error && data) {
      return resolveEffectiveProfileAge(data);
    }
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select(selectCols)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error || !data) return null;
  return resolveEffectiveProfileAge(data);
}
