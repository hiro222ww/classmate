import type { SupabaseClient } from "@supabase/supabase-js";
import { tailJoinId } from "@/lib/joinStateInvariants";
import {
  listClassSessionsWithMembers,
  logClassSessionsDebug,
  pickCanonicalOpenJoinedSession,
  type ClassSessionRow,
} from "@/lib/classSessionSelection";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  evaluateOpenJoinedSessionReuse,
  isSessionEligibleForNormalJoin,
  normalizeSessionStatus,
} from "@/lib/recruitment";

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
  error: "invite_expired" | "session_not_joinable" | "recruitment_closed";
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

function canJoinRequestedSession(params: {
  session: ClassSessionRow;
  matchDeadlineAt?: string | null;
  recruitmentSessionTtlMinutes: number | null;
}) {
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

  const status = normalizeSessionStatus(params.session.status);
  if (
    !isSessionEligibleForNormalJoin({
      sessionStatus: params.session.status,
      sessionCreatedAt: params.session.createdAt,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
    }) &&
    status !== "active"
  ) {
    return { joinable: false as const, reason: "recruitment_closed" as const };
  }

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
        `deviceMember=${requested.deviceIsMember ? 1 : 0}`
    );
  } else {
    console.log(
      `[invite-join] session-state session=${tailJoinId(requestedSessionId)} status=missing members=-`
    );
  }

  if (requested && requested.memberCount > 0 && isTerminalSessionStatus(requested.status)) {
    const nextStatus = requested.memberCount >= 2 ? "active" : "forming";
    const { error } = await input.client
      .from("sessions")
      .update({ status: nextStatus })
      .eq("id", requestedSessionId);

    if (!error) {
      console.log(
        `[invite-join] session-reactivate session=${tailJoinId(requestedSessionId)} ` +
          `from=${normalizeSessionStatus(requested.status)} to=${nextStatus} ` +
          `members=${requested.memberCount}`
      );
      return {
        ok: true,
        sessionId: requestedSessionId,
        sessionStatus: nextStatus,
        memberCount: requested.memberCount,
        requestedSessionId,
        sessionFallback: false,
        sessionReactivated: true,
        reason: "reactivate_with_members",
      };
    }

    console.warn(
      `[invite-join] session-reactivate failed session=${tailJoinId(requestedSessionId)} ` +
        `err=${error.message}`
    );
  }

  if (requested && !isTerminalSessionStatus(requested.status)) {
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

    if (joinable.reason === "recruitment_closed") {
      return {
        ok: false,
        error: "recruitment_closed",
        requestedSessionId,
        sessionStatus: requested.status,
        memberCount: requested.memberCount,
        reason: joinable.reason,
      };
    }
  }

  const canonical = pickCanonicalOpenJoinedSession({
    sessions,
    deviceId,
    matchDeadlineAt: input.matchDeadlineAt,
    recruitmentSessionTtlMinutes: input.recruitmentSessionTtlMinutes,
    preferredSessionId: requestedSessionId,
  });

  if (canonical) {
    const fallback = canonical.sessionId !== requestedSessionId;
    console.log(
      `[invite-join] session-fallback from=${tailJoinId(requestedSessionId)} ` +
        `to=${tailJoinId(canonical.sessionId)} reason=${canonical.reason} ` +
        `members=${canonical.memberCount} fallback=${fallback ? 1 : 0}`
    );
    return {
      ok: true,
      sessionId: canonical.sessionId,
      sessionStatus: canonical.sessionStatus,
      memberCount: canonical.memberCount,
      requestedSessionId,
      sessionFallback: fallback,
      sessionReactivated: false,
      reason: canonical.reason,
    };
  }

  const terminalStatus = requested
    ? normalizeSessionStatus(requested.status)
    : "missing";
  console.log(
    `[invite-join] invite-expired class=${tailJoinId(classId)} ` +
      `requested=${tailJoinId(requestedSessionId)} status=${terminalStatus} ` +
      `members=${requested?.memberCount ?? 0}`
  );

  return {
    ok: false,
    error: "invite_expired",
    requestedSessionId,
    sessionStatus: requested?.status,
    memberCount: requested?.memberCount ?? 0,
    reason: isTerminalSessionStatus(requested?.status)
      ? normalizeSessionStatus(requested?.status)
      : "no_joinable_session",
  };
}
