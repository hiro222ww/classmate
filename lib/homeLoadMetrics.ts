/**
 * Pure helpers for My Class load metrics / request accounting (no PII).
 */

export type HomeMembersRequestPlan = {
  classCount: number;
  withSessionCount: number;
  membersRequests: number;
  statusRequests: number;
  presenceRequests: number;
  totalRequests: number;
};

/** Expected client fetches for one home members wave after enrich. */
export function planHomeMembersRequests(params: {
  classIds: readonly string[];
  sessionIdByClass: ReadonlyMap<string, string | null | undefined>;
}): HomeMembersRequestPlan {
  const classCount = params.classIds.length;
  let withSessionCount = 0;
  for (const classId of params.classIds) {
    if (String(params.sessionIdByClass.get(classId) ?? "").trim()) {
      withSessionCount += 1;
    }
  }
  const membersRequests = classCount;
  const statusRequests = withSessionCount;
  const presenceRequests = classCount;
  return {
    classCount,
    withSessionCount,
    membersRequests,
    statusRequests,
    presenceRequests,
    totalRequests: membersRequests + statusRequests + presenceRequests,
  };
}

export type ClassmatePerfSnapshot = {
  updatedAt: number;
  homeFirstPaintMs?: number | null;
  homeJoinedClassesMs?: number | null;
  membersFirstPaintMs?: number | null;
  callStateReadyMs?: number | null;
  membersTotalMs?: number | null;
  membersRequestCount?: number | null;
  membersClassCount?: number | null;
  openClassTotalMs?: number | null;
  openClassPath?: string | null;
  roomFirstMembersPaintMs?: number | null;
  roomFirstMembersPath?: string | null;
  roomSnapshotAgeMs?: number | null;
};

declare global {
  interface Window {
    __classmatePerf?: ClassmatePerfSnapshot;
  }
}

export function publishClassmatePerf(
  patch: Partial<ClassmatePerfSnapshot>
): ClassmatePerfSnapshot | null {
  if (typeof window === "undefined") return null;
  const next: ClassmatePerfSnapshot = {
    ...(window.__classmatePerf ?? { updatedAt: 0 }),
    ...patch,
    updatedAt: Date.now(),
  };
  window.__classmatePerf = next;
  return next;
}

export function formatClassmatePerfLine(
  snapshot: ClassmatePerfSnapshot
): string {
  return (
    `[classmate-perf] homeFirstPaintMs=${snapshot.homeFirstPaintMs ?? "-"} ` +
    `joinedClassesMs=${snapshot.homeJoinedClassesMs ?? "-"} ` +
    `membersFirstPaintMs=${snapshot.membersFirstPaintMs ?? "-"} ` +
    `callStateReadyMs=${snapshot.callStateReadyMs ?? "-"} ` +
    `membersTotalMs=${snapshot.membersTotalMs ?? "-"} ` +
    `membersRequests=${snapshot.membersRequestCount ?? "-"} ` +
    `openClassTotalMs=${snapshot.openClassTotalMs ?? "-"} ` +
    `openClassPath=${snapshot.openClassPath ?? "-"} ` +
    `roomFirstMembersPaintMs=${snapshot.roomFirstMembersPaintMs ?? "-"} ` +
    `roomFirstMembersPath=${snapshot.roomFirstMembersPath ?? "-"} ` +
    `roomSnapshotAgeMs=${snapshot.roomSnapshotAgeMs ?? "-"}`
  );
}
