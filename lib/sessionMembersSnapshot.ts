export type SessionMemberSnapshotRow = {
  device_id: string;
  display_name?: string | null;
  display_name_source?: string | null;
  photo_path?: string | null;
  avatar_url?: string | null;
  joined_at?: string | null;
  is_in_call?: boolean | null;
  screen?: string | null;
  last_seen_at?: string | null;
};

export type SessionMembersSnapshot = {
  sessionId: string;
  classId: string;
  members: SessionMemberSnapshotRow[];
  updatedAt: number;
};

const STORAGE_PREFIX = "classmate_session_members_snapshot";
const MAX_AGE_MS = 10 * 60 * 1000;

function snapshotKey(sessionId: string, classId: string): string {
  return `${STORAGE_PREFIX}:${String(sessionId ?? "").trim()}:${String(classId ?? "").trim()}`;
}

function normalizeSnapshotMember(
  member: SessionMemberSnapshotRow
): SessionMemberSnapshotRow | null {
  const deviceId = String(member.device_id ?? "").trim();
  if (!deviceId) return null;
  return {
    device_id: deviceId,
    display_name: member.display_name ?? null,
    display_name_source: member.display_name_source ?? null,
    photo_path: member.photo_path ?? null,
    avatar_url: member.avatar_url ?? null,
    joined_at: member.joined_at ?? null,
    is_in_call: member.is_in_call ?? null,
    screen: member.screen ?? null,
    last_seen_at: member.last_seen_at ?? null,
  };
}

export function writeSessionMembersSnapshot(
  sessionId: string,
  classId: string,
  members: ReadonlyArray<SessionMemberSnapshotRow>
) {
  if (typeof window === "undefined") return;
  const sid = String(sessionId ?? "").trim();
  const cid = String(classId ?? "").trim();
  if (!sid || !cid) return;

  const normalized = members
    .map((member) => normalizeSnapshotMember(member))
    .filter((member): member is SessionMemberSnapshotRow => member != null);
  if (normalized.length === 0) return;

  const payload: SessionMembersSnapshot = {
    sessionId: sid,
    classId: cid,
    members: normalized,
    updatedAt: Date.now(),
  };

  try {
    sessionStorage.setItem(snapshotKey(sid, cid), JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function readSessionMembersSnapshot(
  sessionId: string,
  classId: string
): SessionMembersSnapshot | null {
  if (typeof window === "undefined") return null;
  const sid = String(sessionId ?? "").trim();
  const cid = String(classId ?? "").trim();
  if (!sid || !cid) return null;

  try {
    const raw = sessionStorage.getItem(snapshotKey(sid, cid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionMembersSnapshot;
    if (parsed.sessionId !== sid || parsed.classId !== cid) return null;
    if (!Array.isArray(parsed.members) || parsed.members.length === 0) return null;
    if (Date.now() - Number(parsed.updatedAt ?? 0) > MAX_AGE_MS) return null;

    const members = parsed.members
      .map((member) => normalizeSnapshotMember(member))
      .filter((member): member is SessionMemberSnapshotRow => member != null);
    if (members.length === 0) return null;

    return {
      sessionId: sid,
      classId: cid,
      members,
      updatedAt: Number(parsed.updatedAt ?? 0),
    };
  } catch {
    return null;
  }
}

export function clearSessionMembersSnapshot(sessionId: string, classId: string) {
  if (typeof window === "undefined") return;
  const sid = String(sessionId ?? "").trim();
  const cid = String(classId ?? "").trim();
  if (!sid || !cid) return;
  try {
    sessionStorage.removeItem(snapshotKey(sid, cid));
  } catch {
    // ignore
  }
}
