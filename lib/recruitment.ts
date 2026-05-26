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

export function normalizeSessionStatus(status: unknown) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
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

export function canCreateNewRecruitmentSession(params: {
  isExistingMember: boolean;
  matchDeadlineAt?: string | null;
}) {
  if (params.isExistingMember) return true;
  return !isDeadlinePassed(params.matchDeadlineAt ?? null);
}

export function isRecruiting(params: {
  sessionStatus?: string | null;
  matchDeadlineAt?: string | null;
  hasActiveSession?: boolean;
}) {
  if (!params.hasActiveSession) return false;
  if (isDeadlinePassed(params.matchDeadlineAt ?? null)) return false;
  return isSessionOpenForNewJoin(params.sessionStatus);
}

export function getClassStatusLabel(params: {
  sessionStatus?: string | null;
  matchDeadlineAt?: string | null;
  hasActiveSession?: boolean;
}): ClassStatusLabel {
  const sessionStatus = normalizeSessionStatus(params.sessionStatus);
  const hasActiveSession = Boolean(params.hasActiveSession);
  const deadlinePassed = isDeadlinePassed(params.matchDeadlineAt ?? null);

  if (sessionStatus === "active") {
    return "通話中";
  }

  if (deadlinePassed) {
    return "募集締切";
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
