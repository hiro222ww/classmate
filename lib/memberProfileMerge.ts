/**
 * Client-side participant profile merge.
 *
 * Identity key for UI lists is device_id. Display name + photo_path must stay
 * coherent for that id across room/call polls and Realtime-triggered refetches.
 *
 * Rules:
 * - Prefer usable incoming name; never let placeholder/empty wipe a better known name.
 * - Prefer non-empty incoming photo_path; never let null/empty wipe a known path.
 * - avatar_url follows the same last-good rule (secondary to photo_path in render).
 */

import { isDebugLogEnabled, logDebug } from "@/lib/debugLog";
import {
  DISPLAY_NAME_FALLBACK,
  isUsableDisplayName,
  normalizeDisplayNameInput,
} from "@/lib/resolveDisplayName";

export type MemberProfileLike = {
  device_id?: unknown;
  display_name?: unknown;
  photo_path?: unknown;
  avatar_url?: unknown;
};

function normalizePath(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function pickDisplayName(prev: unknown, incoming: unknown): string {
  if (isUsableDisplayName(incoming)) {
    return normalizeDisplayNameInput(incoming);
  }
  if (isUsableDisplayName(prev)) {
    return normalizeDisplayNameInput(prev);
  }
  const incomingTrimmed = normalizeDisplayNameInput(incoming);
  if (incomingTrimmed) return incomingTrimmed;
  const prevTrimmed = normalizeDisplayNameInput(prev);
  if (prevTrimmed) return prevTrimmed;
  return DISPLAY_NAME_FALLBACK;
}

function pickPath(prev: unknown, incoming: unknown): string | null {
  return normalizePath(incoming) || normalizePath(prev) || null;
}

/**
 * Merge profile fields for one participant.
 * `incoming` wins for non-profile keys (call state, presence, etc.).
 */
export function mergeMemberProfileFields<T extends MemberProfileLike>(
  prev: T | null | undefined,
  incoming: T
): T {
  if (!prev) return incoming;

  const displayName = pickDisplayName(prev.display_name, incoming.display_name);
  const photoPath = pickPath(prev.photo_path, incoming.photo_path);
  const avatarUrl = pickPath(prev.avatar_url, incoming.avatar_url);

  return {
    ...prev,
    ...incoming,
    display_name: displayName,
    photo_path: photoPath,
    avatar_url: avatarUrl,
  };
}

/** Apply an incoming roster while retaining better known name/photo per device_id. */
export function applyIncomingMembersWithProfileRetention<
  T extends MemberProfileLike,
>(prev: T[], incoming: T[]): T[] {
  const prevById = new Map<string, T>();
  for (const member of prev) {
    const id = normalizeDisplayNameInput(member.device_id);
    if (id) prevById.set(id, member);
  }

  return incoming.map((member) => {
    const id = normalizeDisplayNameInput(member.device_id);
    if (!id) return member;
    const existing = prevById.get(id);
    return existing ? mergeMemberProfileFields(existing, member) : member;
  });
}

export type MemberProfileMergeLogEvent =
  | "seed_merge"
  | "status_apply"
  | "self_strip"
  | "optimistic_join";

/** Dev-only: no tokens, no signed URLs, no full device ids. */
export function logMemberProfileMerge(params: {
  event: MemberProfileMergeLogEvent;
  context: "room" | "call";
  deviceTail: string;
  idKind?: "device_id";
  prevNameUsable: boolean;
  nextNameUsable: boolean;
  prevHasPhoto: boolean;
  nextHasPhoto: boolean;
  keptPhoto: boolean;
  keptName: boolean;
  source?: string;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "members",
    `[profile-merge] event=${params.event} context=${params.context} ` +
      `idKind=${params.idKind ?? "device_id"} device=${params.deviceTail} ` +
      `prevNameUsable=${params.prevNameUsable ? 1 : 0} ` +
      `nextNameUsable=${params.nextNameUsable ? 1 : 0} ` +
      `prevHasPhoto=${params.prevHasPhoto ? 1 : 0} ` +
      `nextHasPhoto=${params.nextHasPhoto ? 1 : 0} ` +
      `keptName=${params.keptName ? 1 : 0} keptPhoto=${params.keptPhoto ? 1 : 0}` +
      (params.source ? ` source=${params.source}` : "")
  );
}

export function summarizeProfileMergeForLog<T extends MemberProfileLike>(
  prev: T | null | undefined,
  next: T
): {
  prevNameUsable: boolean;
  nextNameUsable: boolean;
  prevHasPhoto: boolean;
  nextHasPhoto: boolean;
  keptPhoto: boolean;
  keptName: boolean;
} {
  const prevNameUsable = isUsableDisplayName(prev?.display_name);
  const nextNameUsable = isUsableDisplayName(next.display_name);
  const prevHasPhoto = Boolean(normalizePath(prev?.photo_path));
  const nextHasPhoto = Boolean(normalizePath(next.photo_path));
  return {
    prevNameUsable,
    nextNameUsable,
    prevHasPhoto,
    nextHasPhoto,
    keptPhoto: prevHasPhoto && nextHasPhoto && normalizePath(prev?.photo_path) === normalizePath(next.photo_path),
    keptName:
      prevNameUsable &&
      nextNameUsable &&
      normalizeDisplayNameInput(prev?.display_name) ===
        normalizeDisplayNameInput(next.display_name),
  };
}
