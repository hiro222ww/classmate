import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tailJoinId } from "@/lib/joinStateInvariants";
import {
  evaluateOpenJoinedSessionReuse,
  isDeadlinePassed,
  isRecruitingSessionStatus,
  isRecruitmentSessionFresh,
  normalizeSessionStatus,
  type OpenJoinedSessionInvalidReason,
} from "@/lib/recruitment";

export type ClassSessionRow = {
  id: string;
  status: string;
  createdAt: string | null;
  capacity: number;
  memberCount: number;
  memberIds: string[];
  deviceIsMember: boolean;
};

export type CanonicalSessionPick = {
  sessionId: string;
  sessionStatus: string;
  sessionCreatedAt: string | null;
  memberCount: number;
  reason:
    | "reuse_active_member"
    | "reuse_active_with_members"
    | "reuse_recruiting_most_members"
    | "reuse_recruiting_newest"
    | "reuse_rpc_session"
    | "reuse_requested_session";
};

function statusRank(status: string): number {
  const normalized = normalizeSessionStatus(status);
  if (normalized === "active") return 0;
  if (normalized === "waiting") return 1;
  if (normalized === "forming") return 2;
  return 9;
}

export async function listClassSessionsWithMembers(
  client: SupabaseClient,
  classId: string,
  deviceId?: string
): Promise<ClassSessionRow[]> {
  const { data: sessions, error } = await client
    .from("sessions")
    .select("id,status,created_at,capacity")
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  if (error || !sessions?.length) return [];

  const sessionIds = sessions
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);

  const { data: memberRows } = await client
    .from("session_members")
    .select("session_id,device_id")
    .in("session_id", sessionIds);

  const membersBySession = new Map<string, string[]>();
  for (const row of memberRows ?? []) {
    const sid = String(row.session_id ?? "").trim();
    const did = String(row.device_id ?? "").trim();
    if (!sid || !did) continue;
    const list = membersBySession.get(sid) ?? [];
    list.push(did);
    membersBySession.set(sid, list);
  }

  return sessions.map((row) => {
    const id = String(row.id ?? "").trim();
    const memberIds = membersBySession.get(id) ?? [];
    return {
      id,
      status: String(row.status ?? "forming"),
      createdAt: row.created_at ?? null,
      capacity: Number(row.capacity ?? 5),
      memberCount: memberIds.length,
      memberIds,
      deviceIsMember: deviceId ? memberIds.includes(deviceId) : false,
    };
  });
}

export function logClassSessionsDebug(
  classId: string,
  sessions: ClassSessionRow[],
  extra?: { selectedSessionId?: string; reason?: string }
) {
  const payload = sessions.map((session) => ({
    id: tailJoinId(session.id),
    status: normalizeSessionStatus(session.status),
    memberCount: session.memberCount,
    members: session.memberIds.map((id) => tailJoinId(id)).join(","),
    createdAt: session.createdAt,
  }));

  console.log(
    `[class-session] class=${tailJoinId(classId)} activeSessions=${sessions.length} ` +
      `sessions=${JSON.stringify(payload)}` +
      (extra?.selectedSessionId
        ? ` selected=${tailJoinId(extra.selectedSessionId)} reason=${extra.reason ?? "-"}`
        : "")
  );
}

function buildOpenJoinedCandidate(
  session: ClassSessionRow,
  matchDeadlineAt: string | null | undefined,
  ttl: number | null | undefined
): CanonicalSessionPick | null {
  const status = normalizeSessionStatus(session.status);
  if (status === "closed" || status === "expired" || status === "ended") {
    return null;
  }
  if (isDeadlinePassed(matchDeadlineAt ?? null) && status === "active") {
    return null;
  }

  const evaluation = evaluateOpenJoinedSessionReuse({
    sessionStatus: session.status,
    sessionCreatedAt: session.createdAt,
    matchDeadlineAt,
    memberCount: session.memberCount,
    deviceIsSessionMember: session.deviceIsMember,
    recruitmentSessionTtlMinutes: ttl,
    allowJoinActiveWithoutMembership: true,
    ignoreRecruitmentTtlWhenHasMembers: true,
  });

  if (!evaluation.reusable) return null;
  if (session.memberCount >= session.capacity) return null;

  let reason: CanonicalSessionPick["reason"];
  if (status === "active" && session.deviceIsMember) {
    reason = "reuse_active_member";
  } else if (status === "active" && session.memberCount > 0) {
    reason = "reuse_active_with_members";
  } else if (session.memberCount > 0) {
    reason = "reuse_recruiting_most_members";
  } else {
    reason = "reuse_recruiting_newest";
  }

  return {
    sessionId: session.id,
    sessionStatus: session.status,
    sessionCreatedAt: session.createdAt,
    memberCount: session.memberCount,
    reason,
  };
}

export function pickCanonicalOpenJoinedSession(params: {
  sessions: ClassSessionRow[];
  deviceId: string;
  matchDeadlineAt?: string | null;
  recruitmentSessionTtlMinutes?: number | null;
  preferredSessionId?: string | null;
}): CanonicalSessionPick | null {
  const ttl = params.recruitmentSessionTtlMinutes;
  const preferredId = String(params.preferredSessionId ?? "").trim();

  if (preferredId) {
    const preferred = params.sessions.find((session) => session.id === preferredId);
    if (preferred) {
      const preferredPick = buildOpenJoinedCandidate(
        preferred,
        params.matchDeadlineAt,
        ttl
      );
      if (preferredPick) {
        return {
          ...preferredPick,
          reason: "reuse_requested_session",
        };
      }
    }
  }

  const candidates: Array<{
    session: ClassSessionRow;
    pick: CanonicalSessionPick;
    score: number;
  }> = [];

  for (const session of params.sessions) {
    const pick = buildOpenJoinedCandidate(
      session,
      params.matchDeadlineAt,
      ttl
    );
    if (!pick) continue;

    const status = normalizeSessionStatus(session.status);
    const createdMs = session.createdAt
      ? new Date(session.createdAt).getTime()
      : 0;

    const score =
      session.memberCount * 10_000 +
      (isRecruitmentSessionFresh(session.createdAt, ttl) ? 1_000 : 0) +
      (10 - statusRank(status)) * 100 -
      createdMs / 1_000_000;

    candidates.push({ session, pick, score });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].pick;
}

export async function pruneSplitClassSessionMemberships(params: {
  classId: string;
  deviceId: string;
  keepSessionId: string;
  client?: SupabaseClient;
}): Promise<number> {
  const client = params.client ?? supabaseAdmin;
  const classId = String(params.classId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();
  const keepSessionId = String(params.keepSessionId ?? "").trim();
  if (!classId || !deviceId || !keepSessionId) return 0;

  const { data: classSessions } = await client
    .from("sessions")
    .select("id,status")
    .eq("class_id", classId);

  const removableStatuses = new Set(["forming", "waiting", "active"]);
  const otherSessionIds = (classSessions ?? [])
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      status: normalizeSessionStatus(row.status),
    }))
    .filter(
      (row) =>
        row.id &&
        row.id !== keepSessionId &&
        removableStatuses.has(row.status)
    )
    .map((row) => row.id);

  if (otherSessionIds.length === 0) return 0;

  const { data: removedRows, error } = await client
    .from("session_members")
    .delete()
    .eq("device_id", deviceId)
    .in("session_id", otherSessionIds)
    .select("session_id");

  if (error) {
    console.warn(
      `[class-session] prune-split failed class=${tailJoinId(classId)} ` +
        `device=${tailJoinId(deviceId)} keep=${tailJoinId(keepSessionId)} err=${error.message}`
    );
    return 0;
  }

  const removed = removedRows?.length ?? 0;
  if (removed > 0) {
    console.log(
      `[class-session] prune-split class=${tailJoinId(classId)} device=${tailJoinId(deviceId)} ` +
        `keep=${tailJoinId(keepSessionId)} removed=${removed} ` +
        `from=${(removedRows ?? [])
          .map((row) => tailJoinId(String(row.session_id ?? "")))
          .join(",")}`
    );
  }

  return removed;
}

export function describeInvalidSessionReason(
  reason: OpenJoinedSessionInvalidReason | null | undefined
) {
  return reason ?? "unknown";
}
