import { mergeHomeMemberWithSessionStatus } from "@/lib/homeMemberPhotoMerge";

export type HomeRosterMember = {
  device_id?: string | null;
  display_name?: string | null;
  photo_path?: string | null;
  avatar_url?: string | null;
  is_in_call?: boolean | null;
  screen?: string | null;
  last_seen_at?: string | null;
  presence_session_id?: string | null;
  [key: string]: unknown;
};

/**
 * Overlay session/status rows onto class/members roster while keeping
 * richer photo/name fields (same rules as HomeClient historically).
 */
export function mergeHomeRosterWithStatusMembers<T extends HomeRosterMember>(
  members: readonly T[],
  statusMembers: readonly T[]
): { members: T[]; sessionMemberIds: Set<string> } {
  const statusByDevice = new Map<string, T>();
  const sessionMemberIds = new Set<string>();

  for (const row of statusMembers) {
    const did = String(row.device_id ?? "").trim();
    if (!did) continue;
    statusByDevice.set(did, row);
    sessionMemberIds.add(did);
  }

  const merged: T[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    const did = String(member.device_id ?? "").trim();
    if (!did) continue;
    seen.add(did);
    const statusMember = statusByDevice.get(did);
    merged.push(
      statusMember
        ? mergeHomeMemberWithSessionStatus(member, statusMember)
        : member
    );
  }

  for (const row of statusMembers) {
    const did = String(row.device_id ?? "").trim();
    if (!did || seen.has(did)) continue;
    merged.push(row);
  }

  return { members: merged, sessionMemberIds };
}

export function deviceIdsFromMembers(
  members: ReadonlyArray<{ device_id?: string | null }>
): Set<string> {
  const ids = new Set<string>();
  for (const member of members) {
    const did = String(member.device_id ?? "").trim();
    if (did) ids.add(did);
  }
  return ids;
}
