export function tailMatchId(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return "-";
  return v.length <= 6 ? v : v.slice(-6);
}

export type MatchJoinPrefsLog = {
  topicKey: string | null;
  worldKey: string;
  minAge: number;
  maxAge: number;
  capacity: number;
  openJoinedClass?: boolean;
};

export function logMatchJoinStart(params: {
  requestId: string;
  deviceId: string;
  prefs: MatchJoinPrefsLog;
}) {
  console.log(
    `[match-join] start requestId=${params.requestId.slice(0, 8)} device=${tailMatchId(params.deviceId)} ` +
      `topic=${params.prefs.topicKey ?? "free"} world=${params.prefs.worldKey} ` +
      `age=${params.prefs.minAge}-${params.prefs.maxAge} cap=${params.prefs.capacity} ` +
      `openJoined=${params.prefs.openJoinedClass === true}`
  );
}

export function logMatchJoinPrefs(params: {
  requestId: string;
  prefs: MatchJoinPrefsLog;
  selfAge: number | null;
}) {
  console.log(
    `[match-join] prefs requestId=${params.requestId.slice(0, 8)} topic=${params.prefs.topicKey ?? "free"} ` +
      `age=${params.prefs.minAge}-${params.prefs.maxAge} selfAge=${params.selfAge ?? "na"} cap=${params.prefs.capacity}`
  );
}

export function logMatchJoinRpcResult(params: {
  requestId: string;
  deviceId: string;
  classId: string;
  sessionId: string;
  createdNewClass: boolean;
  createdNewSession: boolean;
  reused: boolean;
  raceMerged?: boolean;
  candidateSessionCount: number;
}) {
  const joinedExisting = params.reused || params.raceMerged;
  const createdNew = params.createdNewClass && !params.raceMerged;

  console.log(
    `[match-join] joined class=${tailMatchId(params.classId)} session=${tailMatchId(params.sessionId)} ` +
      `device=${tailMatchId(params.deviceId)} requestId=${params.requestId.slice(0, 8)} ` +
      `createdNew=${createdNew} joinedExisting=${joinedExisting} ` +
      `createdNewClass=${params.createdNewClass} createdNewSession=${params.createdNewSession} ` +
      `reused=${params.reused} raceMerged=${params.raceMerged === true} candidates=${params.candidateSessionCount}`
  );

  if (createdNew && params.candidateSessionCount > 0) {
    console.warn(
      `[match-join] race-detected requestId=${params.requestId.slice(0, 8)} ` +
        `createdNew=true but candidates=${params.candidateSessionCount}`
    );
  }
}
