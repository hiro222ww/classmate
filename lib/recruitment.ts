export const DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES = 5;

export const NON_RECRUITING_SESSION_STATUSES = [
  "active",
  "closed",
  "expired",
] as const;

export type ClassStatusLabel =
  | "通話中"
  | "募集中"
  | "募集締切"
  | "募集停止"
  | "待機中"
  | "休止中";

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
  ttlMinutes: number = DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES
) {
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
  recruitmentSessionTtlMinutes?: number;
}) {
  const ttl =
    params.recruitmentSessionTtlMinutes ??
    DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES;
  const status = normalizeSessionStatus(params.sessionStatus);

  if (isDeadlinePassed(params.matchDeadlineAt ?? null)) return false;
  if (!isRecruitingSessionStatus(status)) return false;

  return isRecruitmentSessionFresh(params.sessionCreatedAt, ttl);
}

export function pickClassDisplaySession(
  sessions: RecruitmentSessionRow[],
  ttlMinutes: number = DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES
): RecruitmentSessionRow | null {
  let bestActive: RecruitmentSessionRow | null = null;
  let bestFreshRecruiting: RecruitmentSessionRow | null = null;
  let bestStaleRecruiting: RecruitmentSessionRow | null = null;

  for (const session of sessions) {
    const status = normalizeSessionStatus(session.status);
    const createdMs = sessionCreatedAtMs(session.created_at);
    if (createdMs === null) continue;

    if (status === "active") {
      const currentMs = sessionCreatedAtMs(bestActive?.created_at);
      if (!bestActive || (currentMs !== null && createdMs > currentMs)) {
        bestActive = session;
      }
      continue;
    }

    if (!isRecruitingSessionStatus(status)) continue;

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
  if (bestStaleRecruiting) return bestStaleRecruiting;
  return null;
}

export function isRecruiting(params: {
  sessionStatus?: string | null;
  matchDeadlineAt?: string | null;
  hasActiveSession?: boolean;
  sessionCreatedAt?: string | null;
  recruitmentSessionTtlMinutes?: number;
}) {
  const ttl =
    params.recruitmentSessionTtlMinutes ??
    DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES;

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
  recruitmentSessionTtlMinutes?: number;
}): ClassStatusLabel {
  const sessionStatus = normalizeSessionStatus(params.sessionStatus);
  const hasActiveSession = Boolean(params.hasActiveSession);
  const deadlinePassed = isDeadlinePassed(params.matchDeadlineAt ?? null);
  const ttl =
    params.recruitmentSessionTtlMinutes ??
    DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES;

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
    return "待機中";
  }

  return "休止中";
}

export function sessionStatusesForJoin(isExistingMember: boolean) {
  if (isExistingMember) {
    return ["forming", "waiting", "active", "closed", "expired"];
  }

  return ["forming", "waiting"];
}

export function parseOpenJoinedClassFlag(v: unknown) {
  if (v === true) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}
