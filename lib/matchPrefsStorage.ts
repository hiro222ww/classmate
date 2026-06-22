import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorLookup } from "@/lib/actorIdentity";
import { isValidUuid } from "@/lib/userIdentity";

export const MATCH_PREFS_DEFAULT_MIN_AGE = 0;
export const MATCH_PREFS_DEFAULT_MAX_AGE = 130;

export type MatchPrefsRow = {
  device_id: string;
  user_id?: string | null;
  min_age: number;
  max_age: number;
};

export function defaultMatchPrefs(deviceId: string, userId?: string | null): MatchPrefsRow {
  return {
    device_id: deviceId,
    user_id: userId ?? null,
    min_age: MATCH_PREFS_DEFAULT_MIN_AGE,
    max_age: MATCH_PREFS_DEFAULT_MAX_AGE,
  };
}

export async function userProfileActorExists(
  sb: SupabaseClient,
  actor: ActorLookup
): Promise<boolean> {
  const userId = String(actor.userId ?? "").trim();
  const deviceId = String(actor.deviceId ?? "").trim();

  if (userId && isValidUuid(userId)) {
    const { data, error } = await sb
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (data?.user_id) return true;
  }

  if (!deviceId) return false;

  const { data, error } = await sb
    .from("user_profiles")
    .select("device_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.device_id);
}

/** @deprecated use userProfileActorExists */
export async function userProfileDeviceExists(
  sb: SupabaseClient,
  deviceId: string
): Promise<boolean> {
  return userProfileActorExists(sb, { userId: null, deviceId });
}

export async function readMatchPrefsForActor(
  sb: SupabaseClient,
  actor: ActorLookup
): Promise<MatchPrefsRow | null> {
  const userId = String(actor.userId ?? "").trim();
  const deviceId = String(actor.deviceId ?? "").trim();

  if (userId && isValidUuid(userId)) {
    const { data, error } = await sb
      .from("user_match_prefs")
      .select("device_id,user_id,min_age,max_age")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      return {
        device_id: String(data.device_id ?? deviceId),
        user_id: data.user_id ?? userId,
        min_age: Number(data.min_age ?? MATCH_PREFS_DEFAULT_MIN_AGE),
        max_age: Number(data.max_age ?? MATCH_PREFS_DEFAULT_MAX_AGE),
      };
    }
  }

  if (!deviceId) return null;

  const { data, error } = await sb
    .from("user_match_prefs")
    .select("device_id,user_id,min_age,max_age")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    device_id: String(data.device_id ?? deviceId),
    user_id: data.user_id ?? null,
    min_age: Number(data.min_age ?? MATCH_PREFS_DEFAULT_MIN_AGE),
    max_age: Number(data.max_age ?? MATCH_PREFS_DEFAULT_MAX_AGE),
  };
}

/** @deprecated use readMatchPrefsForActor */
export async function readMatchPrefs(
  sb: SupabaseClient,
  deviceId: string
): Promise<MatchPrefsRow | null> {
  return readMatchPrefsForActor(sb, { userId: null, deviceId });
}

export async function ensureMatchPrefsForActor(
  sb: SupabaseClient,
  actor: ActorLookup,
  prefs?: Pick<MatchPrefsRow, "min_age" | "max_age">
): Promise<MatchPrefsRow> {
  const deviceId = String(actor.deviceId ?? "").trim();
  const userId = String(actor.userId ?? "").trim();

  const payload: Record<string, unknown> = {
    device_id: deviceId,
    min_age: prefs?.min_age ?? MATCH_PREFS_DEFAULT_MIN_AGE,
    max_age: prefs?.max_age ?? MATCH_PREFS_DEFAULT_MAX_AGE,
  };

  if (userId && isValidUuid(userId)) {
    payload.user_id = userId;
  }

  const { data, error } = await sb
    .from("user_match_prefs")
    .upsert(payload, { onConflict: "device_id" })
    .select("device_id,user_id,min_age,max_age")
    .single();

  if (error) throw error;

  return {
    device_id: String(data.device_id ?? deviceId),
    user_id: data.user_id ?? (userId || null),
    min_age: Number(data.min_age ?? MATCH_PREFS_DEFAULT_MIN_AGE),
    max_age: Number(data.max_age ?? MATCH_PREFS_DEFAULT_MAX_AGE),
  };
}

/** @deprecated use ensureMatchPrefsForActor */
export async function ensureMatchPrefsRow(
  sb: SupabaseClient,
  deviceId: string,
  prefs?: Pick<MatchPrefsRow, "min_age" | "max_age">
): Promise<MatchPrefsRow> {
  return ensureMatchPrefsForActor(sb, { userId: null, deviceId }, prefs);
}
