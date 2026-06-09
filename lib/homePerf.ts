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
}

export function logHomeJoinedClasses(ms: number) {
  console.log(`[home-perf] joinedClasses ms=${ms}`);
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
}
