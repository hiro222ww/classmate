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
  // Prefer auth/user profile fields, then fill from device row. Matches
  // /api/profile self GET so account chrome and member strips stay aligned.
  const pick = (userValue?: string | null, deviceValue?: string | null) => {
    const user = String(userValue ?? "").trim();
    if (user) return user;
    const device = String(deviceValue ?? "").trim();
    return device || null;
  };

  return {
    display_name: pick(byUser?.display_name, byDevice?.display_name),
    photo_path: pick(byUser?.photo_path, byDevice?.photo_path),
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
      // Do not seed byUserId from device rows — a device row with empty
      // photo_path would skip the dedicated user_id lookup and hide the
      // Google-linked profile photo.
    }
  }

  if (userIds.length > 0) {
    const { data, error } = await sb
      .from("user_profiles")
      .select("device_id,user_id,display_name,photo_path")
      .in("user_id", userIds);

    if (error) {
      return { ok: false, error: error.message };
    }

    for (const row of data ?? []) {
      const userId = normalizeId(row.user_id);
      if (!userId || !isValidUuid(userId)) continue;
      const existing = byUserId.get(userId);
      const incomingPhoto = String(row.photo_path ?? "").trim();
      const existingPhoto = String(existing?.photo_path ?? "").trim();
      // Prefer the user-linked row that actually has a photo.
      if (!existing || (!existingPhoto && incomingPhoto)) {
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
