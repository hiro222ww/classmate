import { compactMemberDeviceIds } from "@/lib/memberListGuard";

export type MemberComparable = {
  device_id?: string | null;
  display_name?: string | null;
  photo_path?: string | null;
  avatar_url?: string | null;
  joined_at?: string | null;
  is_in_call?: boolean | null;
  screen?: string | null;
  last_seen_at?: string | null;
  lastSpokeAt?: number | null;
};

export function normalizeMembersForCompare(list: MemberComparable[]) {
  return list.map((m) => ({
    device_id: String(m.device_id ?? "").trim(),
    display_name: String(m.display_name ?? "").trim(),
    photo_path: String(m.photo_path ?? "").trim(),
    avatar_url: String(m.avatar_url ?? "").trim(),
    joined_at: String(m.joined_at ?? "").trim(),
    is_in_call: m.is_in_call === true,
    screen: String(m.screen ?? "").trim(),
    last_seen_at: String(m.last_seen_at ?? "").trim(),
    lastSpokeAt: m.lastSpokeAt ?? null,
  }));
}

export function areMembersListEquivalent(
  a: MemberComparable[],
  b: MemberComparable[]
): boolean {
  if (a.length !== b.length) return false;
  return (
    JSON.stringify(normalizeMembersForCompare(a)) ===
    JSON.stringify(normalizeMembersForCompare(b))
  );
}

/** Voice/WebRTC layer: ignore UI-only fields that change at speaking-meter rate. */
export function normalizeVoiceConnectionMembersForCompare(
  list: MemberComparable[]
) {
  return list.map((m) => ({
    device_id: String(m.device_id ?? "").trim(),
    display_name: String(m.display_name ?? "").trim(),
    photo_path: String(m.photo_path ?? "").trim(),
    avatar_url: String(m.avatar_url ?? "").trim(),
    joined_at: String(m.joined_at ?? "").trim(),
    is_in_call: m.is_in_call === true,
    screen: String(m.screen ?? "").trim(),
  }));
}

export function areVoiceConnectionMembersEquivalent(
  a: MemberComparable[],
  b: MemberComparable[]
): boolean {
  if (a.length !== b.length) return false;
  return (
    JSON.stringify(normalizeVoiceConnectionMembersForCompare(a)) ===
    JSON.stringify(normalizeVoiceConnectionMembersForCompare(b))
  );
}

export function buildVoiceConnectionMembersFingerprint(
  list: MemberComparable[],
  viewerDeviceId: string
): string {
  return normalizeVoiceConnectionMembersForCompare(list)
    .filter((m) => m.device_id && m.device_id !== viewerDeviceId && m.is_in_call)
    .map((m) => `${m.device_id}:${m.screen}`)
    .sort()
    .join("|");
}

export function memberListDeviceIdTail(list: MemberComparable[]): string {
  return list
    .map((m) => String(m.device_id ?? "").trim().slice(-4))
    .filter(Boolean)
    .sort()
    .join(",");
}
