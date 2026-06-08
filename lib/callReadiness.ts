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

export function logCallReadyCheck(
  snap: CallReadinessSnapshot,
  reason: string
) {
  const key =
    `${reason}|${snap.sessionId.slice(-6)}|${snap.members}|${snap.remoteIds}|` +
    `${snap.micReady ? 1 : 0}|${snap.signalReady ? 1 : 0}|${snap.settingsReady ? 1 : 0}|` +
    `${snap.turnReady ? 1 : 0}|${snap.callLayerMounted ? 1 : 0}`;
  if (reason === "interval" && key === lastCallReadyCheckKey) return;
  lastCallReadyCheckKey = key;

  console.log(
    `[call-ready-check] session=${snap.sessionId.slice(-6)} ` +
      `class=${snap.classId.slice(-6)} device=${snap.deviceId.slice(-4)} ` +
      `members=${snap.members} remoteIds=${snap.remoteIds} ` +
      `micReady=${snap.micReady ? 1 : 0} signalReady=${snap.signalReady ? 1 : 0} ` +
      `settingsReady=${snap.settingsReady ? 1 : 0} turnReady=${snap.turnReady ? 1 : 0} ` +
      `voiceEnabled=${snap.voiceEnabled ? 1 : 0} callLayerMounted=${snap.callLayerMounted ? 1 : 0} ` +
      `reason=${reason}`
  );
}

export function logCallReadyStuck(
  reason: CallReadyStuckReason,
  snap: CallReadinessSnapshot,
  stuckMs: number
) {
  console.log(
    `[call-ready-stuck] reason=${reason} stuckMs=${stuckMs} ` +
      `session=${snap.sessionId.slice(-6)} members=${snap.members} remoteIds=${snap.remoteIds} ` +
      `micReady=${snap.micReady ? 1 : 0} signalReady=${snap.signalReady ? 1 : 0} ` +
      `settingsReady=${snap.settingsReady ? 1 : 0} turnReady=${snap.turnReady ? 1 : 0}`
  );
}

export const CALL_READY_STUCK_MS = 10_000;
