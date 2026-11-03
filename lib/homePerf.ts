import {
  formatClassmatePerfLine,
  publishClassmatePerf,
} from "@/lib/homeLoadMetrics";

export type HomePerfParts = {
  totalMs: number;
  membershipsMs?: number;
  classesMs?: number;
  slotsMs?: number;
  presenceMs?: number;
  admissionMs?: number;
  sessionsMs?: number;
  enrichMs?: number;
  path?: string;
};

export function logHomePerf(parts: HomePerfParts) {
  console.log(
    `[home-perf] totalMs=${parts.totalMs} ` +
      `membershipsMs=${parts.membershipsMs ?? 0} ` +
      `classesMs=${parts.classesMs ?? 0} ` +
      `slotsMs=${parts.slotsMs ?? 0} ` +
      `presenceMs=${parts.presenceMs ?? 0} ` +
      `admissionMs=${parts.admissionMs ?? 0} ` +
      `sessionsMs=${parts.sessionsMs ?? 0} ` +
      `enrichMs=${parts.enrichMs ?? 0}` +
      (parts.path ? ` path=${parts.path}` : "")
  );
}

export function logHomeFirstPaint(ms: number) {
  console.log(`[home-perf] firstPaint ms=${ms}`);
  const snap = publishClassmatePerf({ homeFirstPaintMs: ms });
  if (snap) console.log(formatClassmatePerfLine(snap));
}

export function logHomeJoinedClasses(ms: number) {
  console.log(`[home-perf] joinedClasses ms=${ms}`);
  publishClassmatePerf({ homeJoinedClassesMs: ms });
}

export function logHomeOpenClassPerf(parts: {
  totalMs: number;
  hintSessionMs: number;
  matchJoinMs: number;
  routeMs: number;
  path: string;
}) {
  console.log(
    `[home-perf] openClass totalMs=${parts.totalMs} ` +
      `hintSessionMs=${parts.hintSessionMs} matchJoinMs=${parts.matchJoinMs} ` +
      `routeMs=${parts.routeMs} path=${parts.path}`
  );
  const snap = publishClassmatePerf({
    openClassTotalMs: parts.totalMs,
    openClassPath: parts.path,
  });
  if (snap) console.log(formatClassmatePerfLine(snap));
}

/** Client-side home members load timings (no PII). */
export function logHomeMembersPerf(parts: {
  gen: number;
  classCount: number;
  membersFirstPaintMs: number | null;
  statusPresenceMs: number | null;
  totalMs: number;
  requestCount?: number | null;
  path?: string;
}) {
  console.log(
    `[home-perf] members gen=${parts.gen} classes=${parts.classCount} ` +
      `membersFirstPaintMs=${parts.membersFirstPaintMs ?? "-"} ` +
      `callStateReadyMs=${parts.statusPresenceMs ?? "-"} ` +
      `statusPresenceMs=${parts.statusPresenceMs ?? "-"} ` +
      `requests=${parts.requestCount ?? "-"} ` +
      `totalMs=${parts.totalMs}` +
      (parts.path ? ` path=${parts.path}` : "")
  );
  const snap = publishClassmatePerf({
    membersFirstPaintMs: parts.membersFirstPaintMs,
    callStateReadyMs: parts.statusPresenceMs,
    membersTotalMs: parts.totalMs,
    membersRequestCount: parts.requestCount ?? null,
    membersClassCount: parts.classCount,
  });
  if (snap) console.log(formatClassmatePerfLine(snap));
}

export function logRoomFirstMembersPaint(parts: {
  ms: number;
  path: string;
  memberCount: number;
  snapshotAgeMs?: number | null;
}) {
  console.log(
    `[room-perf] firstMembersPaint ms=${parts.ms} path=${parts.path} ` +
      `members=${parts.memberCount} snapshotAgeMs=${parts.snapshotAgeMs ?? "-"}`
  );
  const snap = publishClassmatePerf({
    roomFirstMembersPaintMs: parts.ms,
    roomFirstMembersPath: parts.path,
    roomSnapshotAgeMs: parts.snapshotAgeMs ?? null,
  });
  if (snap) console.log(formatClassmatePerfLine(snap));
}
