import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestIdentity } from "@/lib/requestIdentity";
import {
  isValidUuid,
  type UserIdentity,
} from "@/lib/userIdentity";
import {
  lookupEntitlements,
  resolveUserIdForDevice,
} from "@/lib/userIdentityMigration";

export type ApiActor = UserIdentity & {
  userId: string;
};

export type ActorLookup = {
  userId: string | null;
  deviceId: string;
};

export function actorKey(actor: ActorLookup): string {
  return actor.userId || actor.deviceId;
}

export async function resolveInviteApiActor(params: {
  req: Request;
  deviceId: string;
}): Promise<
  | { ok: true; actor: ApiActor }
  | { ok: false; status: number; error: string; message?: string }
> {
  const first = await resolveApiActor({
    req: params.req,
    deviceId: params.deviceId,
  });
  if (first.ok) return first;

  if (
    first.error === "device_user_mismatch" ||
    first.error === "auth_required" ||
    first.error === "invalid_access_token"
  ) {
    return resolveApiActor({
      req: params.req,
      deviceId: params.deviceId,
      ignoreAuth: true,
    });
  }

  return first;
}

export async function resolveApiActor(params: {
  req: Request;
  deviceId?: unknown;
  requireAuth?: boolean;
  ignoreAuth?: boolean;
}): Promise<
  | { ok: true; actor: ApiActor }
  | { ok: false; status: number; error: string; message?: string }
> {
  const identityResult = await resolveRequestIdentity({
    req: params.req,
    deviceId: params.deviceId,
    requireAuth: params.requireAuth ?? false,
    ignoreAuth: params.ignoreAuth,
  });

  if (!identityResult.ok) {
    return identityResult;
  }

  const { identity } = identityResult;
  let userId = String(identity.userId ?? "").trim();

  if (!userId && identity.deviceId) {
    userId = (await resolveUserIdForDevice(identity.deviceId)) ?? "";
  }

  return {
    ok: true,
    actor: {
      ...identity,
      userId,
    },
  };
}

export async function resolveUserIdForTargetDevice(deviceId: string) {
  return resolveUserIdForDevice(deviceId);
}

export async function profileExistsForActor(
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

export async function getClassSlotsForActor(
  sb: SupabaseClient,
  actor: ActorLookup
): Promise<
  | { ok: true; classSlots: number }
  | { ok: false; error: string }
> {
  const deviceId = String(actor.deviceId ?? "").trim();
  if (!deviceId) {
    return { ok: false, error: "device_id_missing" };
  }

  try {
    const ent = await lookupEntitlements({
      userId: actor.userId,
      deviceId,
    });

    return {
      ok: true,
      classSlots: Math.max(1, Number(ent?.class_slots ?? 1)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "entitlements_lookup_failed";
    return { ok: false, error: message };
  }
}

export function membershipFilterForActor(actor: ActorLookup) {
  const userId = String(actor.userId ?? "").trim();
  const deviceId = String(actor.deviceId ?? "").trim();

  if (userId && isValidUuid(userId)) {
    return { column: "user_id" as const, value: userId };
  }

  return { column: "device_id" as const, value: deviceId };
}

export async function hasClassMembershipForActor(
  sb: SupabaseClient,
  actor: ActorLookup,
  classId: string
): Promise<boolean> {
  const normalizedClassId = String(classId ?? "").trim();
  if (!normalizedClassId) return false;

  const filter = membershipFilterForActor(actor);
  if (!filter.value) return false;

  let query = sb
    .from("class_memberships")
    .select("class_id")
    .eq("class_id", normalizedClassId);

  if (filter.column === "user_id") {
    query = query.eq("user_id", filter.value);
  } else {
    query = query.eq("device_id", filter.value);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data?.class_id);
}

export async function fetchBlockedDeviceIdsForActor(
  sb: SupabaseClient,
  actor: ActorLookup
): Promise<string[]> {
  const userId = String(actor.userId ?? "").trim();
  const deviceId = String(actor.deviceId ?? "").trim();
  const ids = new Set<string>();

  if (userId && isValidUuid(userId)) {
    const { data, error } = await sb
      .from("user_blocks")
      .select("blocked_device_id")
      .eq("blocker_user_id", userId);

    if (error) throw error;

    for (const row of data ?? []) {
      const id = String(row.blocked_device_id ?? "").trim();
      if (id) ids.add(id);
    }
  }

  if (deviceId) {
    const { data, error } = await sb
      .from("user_blocks")
      .select("blocked_device_id")
      .eq("blocker_device_id", deviceId);

    if (error) throw error;

    for (const row of data ?? []) {
      const id = String(row.blocked_device_id ?? "").trim();
      if (id) ids.add(id);
    }
  }

  return [...ids];
}

export async function resolvePrimaryDeviceForUser(userId: string) {
  const normalized = String(userId ?? "").trim();
  if (!isValidUuid(normalized)) return null;

  const { data: deviceLink } = await supabaseAdmin
    .from("user_devices")
    .select("device_id")
    .eq("user_id", normalized)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (deviceLink?.device_id) {
    return String(deviceLink.device_id);
  }

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("device_id")
    .eq("user_id", normalized)
    .maybeSingle();

  if (profile?.device_id) {
    return String(profile.device_id);
  }

  const { data: entitlements } = await supabaseAdmin
    .from("user_entitlements")
    .select("device_id")
    .eq("user_id", normalized)
    .maybeSingle();

  return entitlements?.device_id ? String(entitlements.device_id) : null;
}
