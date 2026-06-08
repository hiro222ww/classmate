export const DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES = 5;

export const NON_RECRUITING_SESSION_STATUSES = [
  "active",
  "closed",
  "expired",
] as const;

export type ClassStatusLabel =
  | "通話中"
  | "入室中"
  | "所属中"
  | "募集中"
  | "募集締切"
  | "募集停止"
  | "待機中"
  | "募集終了";

export type RecruitmentSessionRow = {
  id: string;
  status: string;
  created_at: string | null;
};

export function normalizeSessionStatus(status: unknown) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

function sessionCreatedAtMs(sessionCreatedAt?: string | null) {
  if (!sessionCreatedAt) return null;

  const ms = new Date(sessionCreatedAt).getTime();
  if (!Number.isFinite(ms)) return null;

  return ms;
}

export function isRecruitmentSessionFresh(
  sessionCreatedAt?: string | null,
  ttlMinutes: number | null = DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES
) {
  if (ttlMinutes === null) return true;

  const createdMs = sessionCreatedAtMs(sessionCreatedAt);
  if (createdMs === null) return false;

  return Date.now() - createdMs <= ttlMinutes * 60 * 1000;
}

export function isDeadlinePassed(matchDeadlineAt?: string | null) {
  if (!matchDeadlineAt) return false;

  const deadline = new Date(matchDeadlineAt).getTime();
  if (!Number.isFinite(deadline)) return false;

  return Date.now() > deadline;
}

export function blocksNewJoinSessionStatus(status: unknown) {
  const normalized = normalizeSessionStatus(status);
  return (NON_RECRUITING_SESSION_STATUSES as readonly string[]).includes(
    normalized
  );
}

export function isSessionOpenForNewJoin(status: unknown) {
  const normalized = normalizeSessionStatus(status);
  if (!normalized) return true;
  return !blocksNewJoinSessionStatus(normalized);
}

export function isRecruitingSessionStatus(status: unknown) {
  const normalized = normalizeSessionStatus(status);
  return normalized === "forming" || normalized === "waiting";
}

export function canCreateNewRecruitmentSession(params: {
  isExistingMember: boolean;
  matchDeadlineAt?: string | null;
}) {
  if (params.isExistingMember) return true;
  return !isDeadlinePassed(params.matchDeadlineAt ?? null);
}

export function isSessionEligibleForNormalJoin(params: {
  sessionStatus?: string | null;
  sessionCreatedAt?: string | null;
  matchDeadlineAt?: string | null;
  recruitmentSessionTtlMinutes?: number | null;
}) {
  const ttl =
    params.recruitmentSessionTtlMinutes === undefined
      ? DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES
      : params.recruitmentSessionTtlMinutes;
  const status = normalizeSessionStatus(params.sessionStatus);

  if (isDeadlinePassed(params.matchDeadlineAt ?? null)) return false;
  if (!isRecruitingSessionStatus(status)) return false;

  return isRecruitmentSessionFresh(params.sessionCreatedAt, ttl);
}

export type OpenJoinedSessionInvalidReason =
  | "closed"
  | "expired"
  | "ended"
  | "cutoff"
  | "empty"
  | "stale"
  | "active_not_member"
  | "unknown";

export function evaluateOpenJoinedSessionReuse(params: {
  sessionStatus?: string | null;
  sessionCreatedAt?: string | null;
  matchDeadlineAt?: string | null;
  memberCount: number;
  deviceIsSessionMember: boolean;
  recruitmentSessionTtlMinutes?: number | null;
  /** openJoinedClass: join active sessions that already have members. */
  allowJoinActiveWithoutMembership?: boolean;
  /** openJoinedClass: session_members がいれば recruitment TTL stale でも再利用可 */
  ignoreRecruitmentTtlWhenHasMembers?: boolean;
}): { reusable: boolean; reason: OpenJoinedSessionInvalidReason | null } {
  const status = normalizeSessionStatus(params.sessionStatus);
  const ttl =
    params.recruitmentSessionTtlMinutes === undefined
      ? DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES
      : params.recruitmentSessionTtlMinutes;

  if (status === "closed") return { reusable: false, reason: "closed" };
  if (status === "expired") return { reusable: false, reason: "expired" };
  if (status === "ended") return { reusable: false, reason: "ended" };

  if (isDeadlinePassed(params.matchDeadlineAt ?? null)) {
    return { reusable: false, reason: "cutoff" };
  }

  if (status === "active") {
    if (params.memberCount <= 0) {
      return { reusable: false, reason: "empty" };
    }
    if (
      !params.deviceIsSessionMember &&
      !params.allowJoinActiveWithoutMembership
    ) {
      return { reusable: false, reason: "active_not_member" };
    }
    return { reusable: true, reason: null };
  }

  if (isRecruitingSessionStatus(status)) {
    const recruitmentTtlStale = !isRecruitmentSessionFresh(
      params.sessionCreatedAt,
      ttl
    );
    if (
      recruitmentTtlStale &&
      !(
        params.ignoreRecruitmentTtlWhenHasMembers && params.memberCount > 0
      )
    ) {
      return { reusable: false, reason: "stale" };
    }
    return { reusable: true, reason: null };
  }

  return { reusable: false, reason: "unknown" };
}

/** Same rules as /api/session/join + openJoinedClass recruitment freshness. */
export function isSessionJoinableForOpenClass(params: {
  sessionStatus?: string | null;
  sessionCreatedAt?: string | null;
  matchDeadlineAt?: string | null;
  memberCount: number;
  recruitmentSessionTtlMinutes?: number | null;
}): { joinable: boolean; reason: OpenJoinedSessionInvalidReason | null } {
  const evaluation = evaluateOpenJoinedSessionReuse({
    sessionStatus: params.sessionStatus,
    sessionCreatedAt: params.sessionCreatedAt,
    matchDeadlineAt: params.matchDeadlineAt,
    memberCount: params.memberCount,
    deviceIsSessionMember: true,
    recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
    allowJoinActiveWithoutMembership: true,
    ignoreRecruitmentTtlWhenHasMembers: true,
  });

  return {
    joinable: evaluation.reusable,
    reason: evaluation.reason,
  };
}

/** stale alone must not force a new session when members are still in the session. */
export function shouldCreateNewOpenClassSession(
  reason: OpenJoinedSessionInvalidReason | null | undefined,
  memberCount: number,
  sessionStatus?: string | null
): boolean {
  if (!reason) return false;
  if (reason === "stale") return false;
  const status = normalizeSessionStatus(sessionStatus);
  if (reason === "empty" && isRecruitingSessionStatus(status)) return false;
  if (reason === "empty" && memberCount > 0) return false;
  return ["closed", "expired", "ended", "cutoff", "unknown"].includes(reason);
}

/** openJoinedClass: reuse client hint unless terminal or cutoff. */
export function evaluateHintSessionForOpenJoined(params: {
  sessionStatus?: string | null;
  sessionCreatedAt?: string | null;
  matchDeadlineAt?: string | null;
  memberCount: number;
  recruitmentSessionTtlMinutes?: number | null;
}): {
  reusable: boolean;
  reason: OpenJoinedSessionInvalidReason | "not_found" | null;
  staleReason: string | null;
} {
  const ttl =
    params.recruitmentSessionTtlMinutes === undefined
      ? DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES
      : params.recruitmentSessionTtlMinutes;
  const status = normalizeSessionStatus(params.sessionStatus);

  if (status === "closed") {
    return { reusable: false, reason: "closed", staleReason: null };
  }
  if (status === "ended") {
    return { reusable: false, reason: "ended", staleReason: null };
  }
  if (status === "expired") {
    if (params.memberCount <= 0) {
      return {
        reusable: true,
        reason: null,
        staleReason: "expired_ttl_empty",
      };
    }
    return { reusable: false, reason: "expired", staleReason: null };
  }
  if (isDeadlinePassed(params.matchDeadlineAt ?? null)) {
    return { reusable: false, reason: "cutoff", staleReason: null };
  }

  if (isRecruitingSessionStatus(status)) {
    const stale = !isRecruitmentSessionFresh(params.sessionCreatedAt, ttl);
    return {
      reusable: true,
      reason: null,
      staleReason: stale ? "stale" : null,
    };
  }

  if (status === "active") {
    return {
      reusable: true,
      reason: null,
      staleReason: params.memberCount <= 0 ? "empty" : null,
    };
  }

  return { reusable: false, reason: "unknown", staleReason: null };
}

export function isOpenJoinedHintReusableStatus(status: unknown) {
  const normalized = normalizeSessionStatus(status);
  return (
    isRecruitingSessionStatus(normalized) ||
    normalized === "active" ||
    normalized === "expired"
  );
}

export function pickClassDisplaySession(
  sessions: RecruitmentSessionRow[],
  ttlMinutes: number | null = DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES,
  opts?: { matchDeadlineAt?: string | null }
): RecruitmentSessionRow | null {
  const deadlinePassed = isDeadlinePassed(opts?.matchDeadlineAt ?? null);
  let bestActive: RecruitmentSessionRow | null = null;
  let bestFreshRecruiting: RecruitmentSessionRow | null = null;
  let bestStaleRecruiting: RecruitmentSessionRow | null = null;

  for (const session of sessions) {
    const status = normalizeSessionStatus(session.status);
    const createdMs = sessionCreatedAtMs(session.created_at);
    if (createdMs === null) continue;

    if (deadlinePassed && status === "active") {
      continue;
    }

    if (status === "active") {
      const currentMs = sessionCreatedAtMs(bestActive?.created_at);
      if (!bestActive || (currentMs !== null && createdMs > currentMs)) {
        bestActive = session;
      }
      continue;
    }

    if (!isRecruitingSessionStatus(status)) continue;

    if (deadlinePassed) {
      continue;
    }

    const fresh = isRecruitmentSessionFresh(session.created_at, ttlMinutes);
    const target = fresh ? bestFreshRecruiting : bestStaleRecruiting;
    const targetMs = sessionCreatedAtMs(target?.created_at);

    if (!target || (targetMs !== null && createdMs > targetMs)) {
      if (fresh) {
        bestFreshRecruiting = session;
      } else {
        bestStaleRecruiting = session;
      }
    }
  }

  if (bestActive) return bestActive;
  if (bestFreshRecruiting) return bestFreshRecruiting;
  return null;
}

export function isRecruiting(params: {
  sessionStatus?: string | null;
  matchDeadlineAt?: string | null;
  hasActiveSession?: boolean;
  sessionCreatedAt?: string | null;
  recruitmentSessionTtlMinutes?: number | null;
}) {
  const ttl =
    params.recruitmentSessionTtlMinutes === undefined
      ? DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES
      : params.recruitmentSessionTtlMinutes;

  if (!params.hasActiveSession) return false;
  if (isDeadlinePassed(params.matchDeadlineAt ?? null)) return false;

  const status = normalizeSessionStatus(params.sessionStatus);
  if (status === "active") return false;
  if (!isRecruitingSessionStatus(status)) return false;

  return isRecruitmentSessionFresh(params.sessionCreatedAt, ttl);
}

export function getClassStatusLabel(params: {
  sessionStatus?: string | null;
  matchDeadlineAt?: string | null;
  hasActiveSession?: boolean;
  sessionCreatedAt?: string | null;
  recruitmentSessionTtlMinutes?: number | null;
}): ClassStatusLabel {
  const sessionStatus = normalizeSessionStatus(params.sessionStatus);
  const hasActiveSession = Boolean(params.hasActiveSession);
  const deadlinePassed = isDeadlinePassed(params.matchDeadlineAt ?? null);
  const ttl =
    params.recruitmentSessionTtlMinutes === undefined
      ? DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES
      : params.recruitmentSessionTtlMinutes;

  if (sessionStatus === "active") {
    return "通話中";
  }

  if (deadlinePassed) {
    return "募集締切";
  }

  if (
    hasActiveSession &&
    isRecruitingSessionStatus(sessionStatus) &&
    !isRecruitmentSessionFresh(params.sessionCreatedAt, ttl)
  ) {
    return "募集停止";
  }

  if (hasActiveSession && blocksNewJoinSessionStatus(sessionStatus)) {
    return "募集停止";
  }

  if (isRecruiting(params)) {
    return "募集中";
  }

  if (hasActiveSession) {
    return "入室中";
  }

  return "募集終了";
}

export function sessionStatusesForJoin(isExistingMember: boolean) {
  if (isExistingMember) {
    return ["forming", "waiting", "active"];
  }

  return ["forming", "waiting"];
}

export function parseOpenJoinedClassFlag(v: unknown) {
  if (v === true) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}
