import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidUuid } from "@/lib/userIdentity";

export type MemberProfileFields = {
  display_name?: string | null;
  photo_path?: string | null;
};

export type MemberProfileLookup = {
  deviceId: string;
  userId?: string | null;
};

function normalizeId(value: unknown) {
  return String(value ?? "").trim();
}

function mergeProfileFields(
  byDevice: MemberProfileFields | null | undefined,
  byUser: MemberProfileFields | null | undefined
): MemberProfileFields {
  const pick = (deviceValue?: string | null, userValue?: string | null) => {
    const device = String(deviceValue ?? "").trim();
    if (device) return device;
    const user = String(userValue ?? "").trim();
    return user || null;
  };

  return {
    display_name: pick(byDevice?.display_name, byUser?.display_name),
    photo_path: pick(byDevice?.photo_path, byUser?.photo_path),
  };
}

export async function loadProfileMapForMembers(
  sb: SupabaseClient,
  members: MemberProfileLookup[]
): Promise<
  | { ok: true; profileMap: Map<string, MemberProfileFields> }
  | { ok: false; error: string }
> {
  const deviceIds = [
    ...new Set(
      members.map((member) => normalizeId(member.deviceId)).filter(Boolean)
    ),
  ];
  const userIds = [
    ...new Set(
      members
        .map((member) => normalizeId(member.userId))
        .filter((value) => isValidUuid(value))
    ),
  ];

  const byDeviceId = new Map<string, MemberProfileFields>();
  const byUserId = new Map<string, MemberProfileFields>();

  if (deviceIds.length > 0) {
    const { data, error } = await sb
      .from("user_profiles")
      .select("device_id,user_id,display_name,photo_path")
      .in("device_id", deviceIds);

    if (error) {
      return { ok: false, error: error.message };
    }

    for (const row of data ?? []) {
      const deviceId = normalizeId(row.device_id);
      if (deviceId) {
        byDeviceId.set(deviceId, row);
      }

      const userId = normalizeId(row.user_id);
      if (userId && isValidUuid(userId) && !byUserId.has(userId)) {
        byUserId.set(userId, row);
      }
    }
  }

  const missingUserIds = userIds.filter((userId) => !byUserId.has(userId));
  if (missingUserIds.length > 0) {
    const { data, error } = await sb
      .from("user_profiles")
      .select("device_id,user_id,display_name,photo_path")
      .in("user_id", missingUserIds);

    if (error) {
      return { ok: false, error: error.message };
    }

    for (const row of data ?? []) {
      const userId = normalizeId(row.user_id);
      if (userId && isValidUuid(userId)) {
        byUserId.set(userId, row);
      }
    }
  }

  const profileMap = new Map<string, MemberProfileFields>();
  for (const member of members) {
    const deviceId = normalizeId(member.deviceId);
    if (!deviceId) continue;

    const userId = normalizeId(member.userId);
    profileMap.set(
      deviceId,
      mergeProfileFields(
        byDeviceId.get(deviceId),
        userId && isValidUuid(userId) ? byUserId.get(userId) : null
      )
    );
  }

  return { ok: true, profileMap };
}
