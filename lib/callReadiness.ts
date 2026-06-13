import { isDebugVoiceEnabled, voiceProdLog } from "@/lib/debugVoiceLog";

export type CallReadyStuckReason =
  | "mic_not_ready"
  | "signal_not_ready"
  | "settings_not_ready"
  | "turn_not_ready"
  | "no_remote_ids"
  | "voice_layer_not_mounted"
  | "voice_disabled"
  | "unknown";

export type CallReadinessSnapshot = {
  sessionId: string;
  classId: string;
  deviceId: string;
  members: number;
  remoteIds: number;
  micReady: boolean;
  signalReady: boolean;
  settingsReady: boolean;
  turnReady: boolean;
  voiceEnabled: boolean;
  callLayerMounted: boolean;
};

export function resolveCallReadyStuckReason(
  snap: CallReadinessSnapshot
): CallReadyStuckReason | null {
  if (!snap.callLayerMounted) return "voice_layer_not_mounted";
  if (!snap.voiceEnabled) return "voice_disabled";
  if (!snap.settingsReady) return "settings_not_ready";
  if (!snap.signalReady) return "signal_not_ready";
  if (!snap.turnReady) return "turn_not_ready";
  if (snap.members > 1 && snap.remoteIds < 1) return "no_remote_ids";
  return null;
}

let lastCallReadyCheckKey = "";
const initialCallReadyCheckLogged = new Set<string>();

function buildCallReadyStateKey(snap: CallReadinessSnapshot) {
  return (
    `${snap.sessionId.slice(-6)}|${snap.members}|${snap.remoteIds}|` +
    `${snap.micReady ? 1 : 0}|${snap.signalReady ? 1 : 0}|${snap.settingsReady ? 1 : 0}|` +
    `${snap.turnReady ? 1 : 0}|${snap.callLayerMounted ? 1 : 0}|${snap.voiceEnabled ? 1 : 0}`
  );
}

export function logCallReadyCheck(
  snap: CallReadinessSnapshot,
  reason: string,
  wait?: ReturnType<typeof formatCallReadinessWaitMetrics>
) {
  if (reason === "initial") {
    const sessionKey = snap.sessionId;
    if (initialCallReadyCheckLogged.has(sessionKey)) return;
    initialCallReadyCheckLogged.add(sessionKey);
  } else if (reason === "interval") {
    if (!isDebugVoiceEnabled()) return;
  }

  const key = buildCallReadyStateKey(snap);
  if (reason !== "initial" && key === lastCallReadyCheckKey) {
    return;
  }
  lastCallReadyCheckKey = key;

  const waitSuffix = wait
    ? ` totalWaitMs=${wait.totalWaitMs} turnWaitMs=${wait.turnWaitMs} allReadyWaitMs=${wait.allReadyWaitMs}`
    : "";

  voiceProdLog(
    `[call-ready-check] session=${snap.sessionId.slice(-6)} ` +
      `class=${snap.classId.slice(-6)} device=${snap.deviceId.slice(-4)} ` +
      `members=${snap.members} remoteIds=${snap.remoteIds} ` +
      `micReady=${snap.micReady ? 1 : 0} signalReady=${snap.signalReady ? 1 : 0} ` +
      `settingsReady=${snap.settingsReady ? 1 : 0} turnReady=${snap.turnReady ? 1 : 0} ` +
      `voiceEnabled=${snap.voiceEnabled ? 1 : 0} callLayerMounted=${snap.callLayerMounted ? 1 : 0} ` +
      `reason=${reason}${waitSuffix}`
  );
}

export function logCallReadyStuck(
  reason: CallReadyStuckReason,
  snap: CallReadinessSnapshot,
  stuckMs: number,
  extra?: {
    awaitingAnswer?: boolean;
    playbackEvidence?: boolean;
  }
) {
  const extraSuffix = extra
    ? ` awaitingAnswer=${extra.awaitingAnswer === true ? 1 : 0} ` +
      `playbackEvidence=${extra.playbackEvidence === true ? 1 : 0}`
    : "";
  voiceProdLog(
    `[call-ready-stuck] reason=${reason} stuckMs=${stuckMs} ` +
      `session=${snap.sessionId.slice(-6)} members=${snap.members} remoteIds=${snap.remoteIds} ` +
      `micReady=${snap.micReady ? 1 : 0} signalReady=${snap.signalReady ? 1 : 0} ` +
      `settingsReady=${snap.settingsReady ? 1 : 0} turnReady=${snap.turnReady ? 1 : 0}` +
      extraSuffix
  );
}

export function resetCallReadinessSessionLog(sessionId: string) {
  const sid = String(sessionId ?? "").trim();
  if (!sid) return;
  initialCallReadyCheckLogged.delete(sid);
  if (lastCallReadyCheckKey.startsWith(`${sid.slice(-6)}|`)) {
    lastCallReadyCheckKey = "";
  }
}

/** Show reconnect UI when prerequisites stay unmet this long. */
export const CALL_READY_STUCK_MS = 12_000;

/** Target time to reach playback evidence before prompting reconnect. */
export const VOICE_PLAYBACK_CONNECT_TARGET_MS = 12_000;

export type CallReadinessWaitState = {
  sessionKey: string;
  startedAt: number;
  settingsReadyAt: number | null;
  turnReadyAt: number | null;
  micReadyAt: number | null;
  signalReadyAt: number | null;
  allReadyAt: number | null;
  turnWaitStartedAt: number | null;
};

export function createCallReadinessWaitState(sessionKey: string): CallReadinessWaitState {
  return {
    sessionKey,
    startedAt: Date.now(),
    settingsReadyAt: null,
    turnReadyAt: null,
    micReadyAt: null,
    signalReadyAt: null,
    allReadyAt: null,
    turnWaitStartedAt: null,
  };
}

export function updateCallReadinessWaitState(
  state: CallReadinessWaitState,
  snap: CallReadinessSnapshot,
  sessionKey: string
): CallReadinessWaitState {
  const now = Date.now();
  if (state.sessionKey !== sessionKey) {
    return {
      ...createCallReadinessWaitState(sessionKey),
      settingsReadyAt: snap.settingsReady ? now : null,
      turnReadyAt: snap.turnReady ? now : null,
      micReadyAt: snap.micReady ? now : null,
      signalReadyAt: snap.signalReady ? now : null,
      allReadyAt:
        snap.settingsReady &&
        snap.signalReady &&
        snap.turnReady &&
        snap.micReady
          ? now
          : null,
      turnWaitStartedAt:
        snap.settingsReady && !snap.turnReady ? now : null,
    };
  }

  const next = { ...state };
  if (snap.settingsReady && next.settingsReadyAt == null) {
    next.settingsReadyAt = now;
  }
  if (snap.turnReady && next.turnReadyAt == null) {
    next.turnReadyAt = now;
  }
  if (snap.micReady && next.micReadyAt == null) {
    next.micReadyAt = now;
  }
  if (snap.signalReady && next.signalReadyAt == null) {
    next.signalReadyAt = now;
  }
  if (
    snap.settingsReady &&
    !snap.turnReady &&
    next.turnWaitStartedAt == null
  ) {
    next.turnWaitStartedAt = now;
  }
  if (snap.turnReady) {
    next.turnWaitStartedAt = null;
  }
  if (
    snap.settingsReady &&
    snap.signalReady &&
    snap.turnReady &&
    snap.micReady &&
    next.allReadyAt == null
  ) {
    next.allReadyAt = now;
  }
  return next;
}

export function formatCallReadinessWaitMetrics(
  state: CallReadinessWaitState,
  snap: CallReadinessSnapshot
): {
  totalWaitMs: number;
  turnWaitMs: number;
  allReadyWaitMs: number;
} {
  const now = Date.now();
  const totalWaitMs = Math.max(0, now - state.startedAt);
  const turnWaitMs =
    snap.turnReady && state.turnWaitStartedAt != null && state.turnReadyAt != null
      ? Math.max(0, state.turnReadyAt - state.turnWaitStartedAt)
      : !snap.turnReady && state.turnWaitStartedAt != null
        ? Math.max(0, now - state.turnWaitStartedAt)
        : 0;
  const allReadyWaitMs =
    state.allReadyAt != null
      ? Math.max(0, state.allReadyAt - state.startedAt)
      : totalWaitMs;
  return { totalWaitMs, turnWaitMs, allReadyWaitMs };
}
