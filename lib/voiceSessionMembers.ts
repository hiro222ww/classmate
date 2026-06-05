import { isStableVoiceJoinMode } from "@/lib/stableVoiceJoin";

export type VoiceMemberRow = {
  device_id?: string | null;
  display_name?: string | null;
  photo_path?: string | null;
  avatar_url?: string | null;
  screen?: string | null;
  last_seen_at?: string | null;
  is_in_call?: boolean | null;
};

export function compactVoiceMemberIds(
  members: ReadonlyArray<{ device_id?: string | null }>
): string {
  return members
    .map((m) => String(m.device_id ?? "").trim().slice(-4))
    .filter(Boolean)
    .join(",");
}

/** Voice mesh targets: session_members (self excluded). Ignores is_in_call in stable mode. */
export function getVoiceConnectionRemoteIds(
  members: ReadonlyArray<VoiceMemberRow>,
  viewerDeviceId: string
): string[] {
  const selfId = String(viewerDeviceId ?? "").trim();
  const ids = members
    .map((m) => String(m.device_id ?? "").trim())
    .filter((id) => id && id !== selfId);

  if (isStableVoiceJoinMode()) {
    return Array.from(new Set(ids));
  }

  return Array.from(
    new Set(
      members
        .filter((m) => m.is_in_call === true)
        .map((m) => String(m.device_id ?? "").trim())
        .filter((id) => id && id !== selfId)
    )
  );
}

export function countVoiceConnectionMembers(
  members: ReadonlyArray<VoiceMemberRow>,
  viewerDeviceId: string
): number {
  const selfId = String(viewerDeviceId ?? "").trim();
  const sessionCount = members.filter((m) => {
    const id = String(m.device_id ?? "").trim();
    return !!id;
  }).length;

  if (isStableVoiceJoinMode()) {
    return Math.max(1, sessionCount || 1);
  }

  const inCallCount = members.filter((m) => m.is_in_call === true).length;
  return Math.max(1, inCallCount || sessionCount || 1);
}

/** Viewer on /call is in voice regardless of transient is_in_call=false. */
export function isViewerInVoiceConnection(
  viewerDeviceId: string,
  members: ReadonlyArray<VoiceMemberRow>
): boolean {
  const selfId = String(viewerDeviceId ?? "").trim();
  if (!selfId) return false;

  if (isStableVoiceJoinMode()) {
    return members.some((m) => String(m.device_id ?? "").trim() === selfId);
  }

  const self = members.find((m) => String(m.device_id ?? "").trim() === selfId);
  return self?.is_in_call !== false;
}

export function isRemoteInVoiceConnection(
  remoteId: string,
  remoteIds: ReadonlyArray<string>
): boolean {
  const id = String(remoteId ?? "").trim();
  if (!id) return false;
  return remoteIds.includes(id);
}

/**
 * Merge latest member rows with last known session_members ids so voice layer
 * never loses targets when presence_sync sets is_in_call=false.
 */
export function buildVoiceConnectionMembers<T extends VoiceMemberRow>(
  members: T[],
  sessionMemberIds: ReadonlyArray<string>,
  viewerDeviceId: string,
  fallbackSelf?: T
): T[] {
  const ids = Array.from(
    new Set(
      sessionMemberIds
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (ids.length === 0) {
    return members;
  }

  const byId = new Map(
    members
      .map((m) => [String(m.device_id ?? "").trim(), m] as const)
      .filter(([id]) => !!id)
  );

  const merged: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) {
      merged.push(row);
      continue;
    }
    if (fallbackSelf && id === String(viewerDeviceId ?? "").trim()) {
      merged.push(fallbackSelf);
      continue;
    }
    merged.push({
      device_id: id,
      display_name: "参加者",
      is_in_call: isStableVoiceJoinMode() ? true : false,
    } as T);
  }

  return merged.length > 0 ? merged : members;
}
