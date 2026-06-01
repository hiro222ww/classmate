import { supabase } from "@/lib/supabaseClient";
import { DISPLAY_NAME_FALLBACK } from "@/lib/resolveDisplayName";
import {
  formatGenderLabel,
  isUserProfileComplete,
  resolvePublicProfileAge,
} from "@/lib/profileClient";

export { formatGenderLabel };

export type MemberProfileDetail = {
  device_id: string;
  display_name: string;
  photo_path: string | null;
  gender: string | null;
  age: number | null;
  hobbies: string | null;
  bio: string | null;
  profile_complete: boolean;
};

export type MemberProfileTarget = {
  deviceId: string;
  viewerDeviceId: string;
  displayName?: string;
  photoPath?: string | null;
  classId?: string;
  sessionId?: string;
};

export const LIST_MEMBER_AVATAR_PX = 42;

export function normalizeMemberDeviceId(v: unknown) {
  return String(v ?? "").trim();
}

export function isValidMemberProfileTarget(
  target: MemberProfileTarget | null | undefined
): target is MemberProfileTarget {
  const deviceId = normalizeMemberDeviceId(target?.deviceId);
  const viewerDeviceId = normalizeMemberDeviceId(target?.viewerDeviceId);
  if (!deviceId || !viewerDeviceId) return false;

  const classId = normalizeMemberDeviceId(target?.classId);
  const sessionId = normalizeMemberDeviceId(target?.sessionId);
  return Boolean(classId || sessionId || deviceId === viewerDeviceId);
}

export function getMemberAvatarUrl(photoPath?: string | null) {
  let normalized = String(photoPath ?? "").trim();

  if (!normalized) return "/default-avatar.jpg";

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  if (normalized.startsWith("profile-photos/")) {
    normalized = normalized.replace(/^profile-photos\//, "");
  }

  if (normalized.startsWith("avatars/")) {
    normalized = normalized.replace(/^avatars\//, "");
  }

  const { data } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(normalized);

  const publicUrl = data?.publicUrl?.trim();
  if (!publicUrl) return "/default-avatar.jpg";

  return `${publicUrl}?v=${encodeURIComponent(normalized)}`;
}

export async function fetchMemberProfile(
  target: MemberProfileTarget
): Promise<MemberProfileDetail | null> {
  const deviceId = normalizeMemberDeviceId(target.deviceId);
  const viewerDeviceId = normalizeMemberDeviceId(target.viewerDeviceId);
  const classId = normalizeMemberDeviceId(target.classId);
  const sessionId = normalizeMemberDeviceId(target.sessionId);

  if (!isValidMemberProfileTarget({ ...target, deviceId, viewerDeviceId })) {
    return null;
  }

  const qs = new URLSearchParams({
    device_id: deviceId,
    viewer_device_id: viewerDeviceId,
  });

  if (classId) qs.set("class_id", classId);
  if (sessionId) qs.set("session_id", sessionId);

  const res = await fetch(`/api/profile?${qs.toString()}`, {
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok || !json?.profile) {
    return null;
  }

  const profile = json.profile as {
    device_id?: string | null;
    display_name?: string | null;
    gender?: string | null;
    photo_path?: string | null;
    birth_date?: string | null;
    age?: number | null;
    hobbies?: string | null;
    bio?: string | null;
    profile_complete?: boolean;
  };

  const profileComplete =
    json.profile_complete === true || profile.profile_complete === true;

  const displayName = String(profile.display_name ?? "").trim();
  const age = resolvePublicProfileAge(profile, profile.age);
  const gender = profileComplete ? profile.gender ?? null : null;

  return {
    device_id: normalizeMemberDeviceId(profile.device_id) || deviceId,
    display_name: displayName || DISPLAY_NAME_FALLBACK,
    photo_path: profile.photo_path ?? null,
    gender,
    age,
    hobbies: String(profile.hobbies ?? "").trim() || null,
    bio: String(profile.bio ?? "").trim() || null,
    profile_complete: profileComplete,
  };
}
