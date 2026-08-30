import type { SupabaseClient } from "@supabase/supabase-js";
import { tailJoinId } from "@/lib/joinStateInvariants";
import {
  listClassSessionsWithMembers,
  logClassSessionsDebug,
  type ClassSessionRow,
} from "@/lib/classSessionSelection";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  evaluateOpenJoinedSessionReuse,
  normalizeSessionStatus,
} from "@/lib/recruitment";
import { isSessionOpenForMatchJoin } from "@/lib/sessionJoinLock";

const TERMINAL_SESSION_STATUSES = new Set(["closed", "ended", "expired"]);

export type ResolveInviteJoinSessionInput = {
  client: SupabaseClient;
  classId: string;
  requestedSessionId: string;
  deviceId: string;
  matchDeadlineAt?: string | null;
  recruitmentSessionTtlMinutes: number | null;
};

export type ResolveInviteJoinSessionSuccess = {
  ok: true;
  sessionId: string;
  sessionStatus: string;
  memberCount: number;
  requestedSessionId: string;
  sessionFallback: boolean;
  sessionReactivated: boolean;
  reason: string;
};

export type ResolveInviteJoinSessionFailure = {
  ok: false;
  error:
    | "invite_expired"
    | "session_not_joinable"
    | "recruitment_closed"
    | "session_closed"
    | "session_members_locked";
  requestedSessionId: string;
  sessionStatus?: string;
  memberCount?: number;
  reason?: string;
};

export type ResolveInviteJoinSessionResult =
  | ResolveInviteJoinSessionSuccess
  | ResolveInviteJoinSessionFailure;

function isTerminalSessionStatus(status: unknown) {
  return TERMINAL_SESSION_STATUSES.has(normalizeSessionStatus(status));
}

function isMembersLocked(session: ClassSessionRow): boolean {
  if (session.membersLockedAt) return true;
  return !isSessionOpenForMatchJoin({
    membersLockedAt: session.membersLockedAt,
    joinOpenUntil: session.joinOpenUntil,
  }) && Boolean(session.joinOpenUntil);
}

export function canJoinRequestedSession(params: {
  session: ClassSessionRow;
  matchDeadlineAt?: string | null;
  recruitmentSessionTtlMinutes: number | null;
}) {
  if (isMembersLocked(params.session) && !params.session.deviceIsMember) {
    return { joinable: false as const, reason: "session_members_locked" };
  }

  const reuse = evaluateOpenJoinedSessionReuse({
    sessionStatus: params.session.status,
    sessionCreatedAt: params.session.createdAt,
    matchDeadlineAt: params.matchDeadlineAt,
    memberCount: params.session.memberCount,
    deviceIsSessionMember: params.session.deviceIsMember,
    recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
    allowJoinActiveWithoutMembership: true,
    ignoreRecruitmentTtlWhenHasMembers: true,
  });

  if (!reuse.reusable) {
    return { joinable: false as const, reason: reuse.reason ?? "unknown" };
  }

  // evaluateOpenJoinedSessionReuse already allows stale recruiting sessions when
  // members are present (invite while host is waiting alone > recruitment TTL).
  return { joinable: true as const, reason: null };
}

export async function resolveInviteJoinSession(
  input: ResolveInviteJoinSessionInput
): Promise<ResolveInviteJoinSessionResult> {
  const classId = String(input.classId ?? "").trim();
  const requestedSessionId = String(input.requestedSessionId ?? "").trim();
  const deviceId = String(input.deviceId ?? "").trim();

  const expireResult = await expireStaleRecruitmentSessions(input.client, {
    classIds: [classId],
    ttlMinutes: input.recruitmentSessionTtlMinutes,
    keepSessionsWithMembers: true,
    excludeSessionIds: requestedSessionId ? [requestedSessionId] : [],
  });

  if (!expireResult.ok) {
    console.warn(
      `[invite-join] expire-stale failed class=${tailJoinId(classId)} ` +
        `session=${tailJoinId(requestedSessionId)} err=${expireResult.error ?? "unknown"}`
    );
  } else if (expireResult.cutoff) {
    console.log(
      `[invite-join] expire-stale ok class=${tailJoinId(classId)} ` +
        `keepMembers=1 cutoff=${expireResult.cutoff}`
    );
  }

  const sessions = await listClassSessionsWithMembers(
    input.client,
    classId,
    deviceId
  );
  logClassSessionsDebug(classId, sessions, {
    selectedSessionId: requestedSessionId,
    reason: "invite_resolve",
  });

  const requested = sessions.find((session) => session.id === requestedSessionId);
  if (requested) {
    console.log(
      `[invite-join] session-state session=${tailJoinId(requestedSessionId)} ` +
        `status=${normalizeSessionStatus(requested.status)} members=${requested.memberCount} ` +
        `deviceMember=${requested.deviceIsMember ? 1 : 0} ` +
        `locked=${requested.membersLockedAt ? 1 : 0}`
    );
  } else {
    console.log(
      `[invite-join] session-state session=${tailJoinId(requestedSessionId)} status=missing members=-`
    );
  }

  // Exact invited session only — never invent / switch to another session.
  if (!requested) {
    return {
      ok: false,
      error: "invite_expired",
      requestedSessionId,
      sessionStatus: "missing",
      memberCount: 0,
      reason: "session_missing",
    };
  }

  // Existing members may re-enter even after lock / terminal status.
  if (requested.deviceIsMember) {
    return {
      ok: true,
      sessionId: requestedSessionId,
      sessionStatus: requested.status,
      memberCount: requested.memberCount,
      requestedSessionId,
      sessionFallback: false,
      sessionReactivated: false,
      reason: "requested_session_member",
    };
  }

  if (isMembersLocked(requested)) {
    console.log(
      `[invite-join] members-locked session=${tailJoinId(requestedSessionId)} ` +
        `members=${requested.memberCount}`
    );
    return {
      ok: false,
      error: "session_members_locked",
      requestedSessionId,
      sessionStatus: requested.status,
      memberCount: requested.memberCount,
      reason: "session_members_locked",
    };
  }

  if (isTerminalSessionStatus(requested.status)) {
    console.log(
      `[invite-join] session-closed session=${tailJoinId(requestedSessionId)} ` +
        `status=${normalizeSessionStatus(requested.status)}`
    );
    return {
      ok: false,
      error: "session_closed",
      requestedSessionId,
      sessionStatus: requested.status,
      memberCount: requested.memberCount,
      reason: normalizeSessionStatus(requested.status),
    };
  }

  const joinable = canJoinRequestedSession({
    session: requested,
    matchDeadlineAt: input.matchDeadlineAt,
    recruitmentSessionTtlMinutes: input.recruitmentSessionTtlMinutes,
  });
  if (joinable.joinable) {
    return {
      ok: true,
      sessionId: requestedSessionId,
      sessionStatus: requested.status,
      memberCount: requested.memberCount,
      requestedSessionId,
      sessionFallback: false,
      sessionReactivated: false,
      reason: "requested_session",
    };
  }

  if (joinable.reason === "session_members_locked") {
    return {
      ok: false,
      error: "session_members_locked",
      requestedSessionId,
      sessionStatus: requested.status,
      memberCount: requested.memberCount,
      reason: "session_members_locked",
    };
  }

  console.log(
    `[invite-join] invite-expired class=${tailJoinId(classId)} ` +
      `requested=${tailJoinId(requestedSessionId)} status=${normalizeSessionStatus(requested.status)} ` +
      `members=${requested.memberCount} reason=${joinable.reason}`
  );

  return {
    ok: false,
    error: "invite_expired",
    requestedSessionId,
    sessionStatus: requested.status,
    memberCount: requested.memberCount,
    reason: joinable.reason,
  };
}
