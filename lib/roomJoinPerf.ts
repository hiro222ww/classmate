export type RoomJoinPerfParts = {
  totalMs: number;
  path: string;
  ensureMembershipMs?: number;
  sessionMembersUpsertMs?: number;
  presenceMs?: number;
  sessionFetchMs?: number;
  classFetchMs?: number;
  repairMs?: number;
  otherMs?: number;
};

export function logRoomJoinPerf(parts: RoomJoinPerfParts) {
  const accounted =
    (parts.ensureMembershipMs ?? 0) +
    (parts.sessionMembersUpsertMs ?? 0) +
    (parts.presenceMs ?? 0) +
    (parts.sessionFetchMs ?? 0) +
    (parts.classFetchMs ?? 0) +
    (parts.repairMs ?? 0);
  const otherMs =
    parts.otherMs ?? Math.max(0, parts.totalMs - accounted);

  console.log(
    `[room-join-perf] totalMs=${parts.totalMs} path=${parts.path} ` +
      `ensureMembershipMs=${parts.ensureMembershipMs ?? 0} ` +
      `sessionMembersUpsertMs=${parts.sessionMembersUpsertMs ?? 0} ` +
      `presenceMs=${parts.presenceMs ?? 0} ` +
      `sessionFetchMs=${parts.sessionFetchMs ?? 0} ` +
      `classFetchMs=${parts.classFetchMs ?? 0} ` +
      `repairMs=${parts.repairMs ?? 0} otherMs=${otherMs}`
  );
}
