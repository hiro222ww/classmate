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
    if (!params.deviceIsSessionMember) {
      return { reusable: false, reason: "active_not_member" };
    }
    return { reusable: true, reason: null };
  }

  if (isRecruitingSessionStatus(status)) {
    if (!isRecruitmentSessionFresh(params.sessionCreatedAt, ttl)) {
      return { reusable: false, reason: "stale" };
    }
    return { reusable: true, reason: null };
  }

  return { reusable: false, reason: "unknown" };
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
