import type { SupabaseClient } from "@supabase/supabase-js";

export const MATCH_PREFS_DEFAULT_MIN_AGE = 0;
export const MATCH_PREFS_DEFAULT_MAX_AGE = 130;

export type MatchPrefsRow = {
  device_id: string;
  min_age: number;
  max_age: number;
};

export function defaultMatchPrefs(deviceId: string): MatchPrefsRow {
  return {
    device_id: deviceId,
    min_age: MATCH_PREFS_DEFAULT_MIN_AGE,
    max_age: MATCH_PREFS_DEFAULT_MAX_AGE,
  };
}

export async function userProfileDeviceExists(
  sb: SupabaseClient,
  deviceId: string
): Promise<boolean> {
  const { data, error } = await sb
    .from("user_profiles")
    .select("device_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.device_id);
}

export async function readMatchPrefs(
  sb: SupabaseClient,
  deviceId: string
): Promise<MatchPrefsRow | null> {
  const { data, error } = await sb
    .from("user_match_prefs")
    .select("device_id,min_age,max_age")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;

  return {
    device_id: String(data.device_id ?? deviceId),
    min_age: Number(data.min_age ?? MATCH_PREFS_DEFAULT_MIN_AGE),
    max_age: Number(data.max_age ?? MATCH_PREFS_DEFAULT_MAX_AGE),
  };
}

export async function ensureMatchPrefsRow(
  sb: SupabaseClient,
  deviceId: string,
  prefs?: Pick<MatchPrefsRow, "min_age" | "max_age">
): Promise<MatchPrefsRow> {
  const payload = {
    device_id: deviceId,
    min_age: prefs?.min_age ?? MATCH_PREFS_DEFAULT_MIN_AGE,
    max_age: prefs?.max_age ?? MATCH_PREFS_DEFAULT_MAX_AGE,
  };

  const { data, error } = await sb
    .from("user_match_prefs")
    .upsert(payload, { onConflict: "device_id" })
    .select("device_id,min_age,max_age")
    .single();

  if (error) {
    throw error;
  }

  return {
    device_id: String(data.device_id ?? deviceId),
    min_age: Number(data.min_age ?? payload.min_age),
    max_age: Number(data.max_age ?? payload.max_age),
  };
}
