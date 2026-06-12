import { debugConsoleLog, voiceProdLog } from "@/lib/debugVoiceLog";
function compactCallScopeId(id: string | null | undefined, tail = 8): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= tail) return value;
  return value.slice(-tail);
}

export function logInitialSafetyMute(params: {
  sessionId: string;
  deviceId: string;
}) {
  debugConsoleLog(
    `[local-mic] initial-safety-mute session=${compactCallScopeId(params.sessionId)} ` +
      `device=${compactCallScopeId(params.deviceId, 4)} userMuted=true trackEnabled=false`
  );
}

export function compactMicTrackId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 6) return value;
  return value.slice(-6);
}

export function logMuteStateSet(params: {
  userMuted: boolean;
  prev: boolean;
  reason: string;
  source: string;
}) {
  debugConsoleLog(
    `[local-mic] mute-state-set userMuted=${params.userMuted} prev=${params.prev} ` +
      `reason=${params.reason} source=${params.source}`
  );
}

export function logVoiceUiMuteToggle(params: {
  fromMuted: boolean;
  toMuted: boolean;
  refMuted: boolean;
}) {
  const fromLabel = params.fromMuted ? "muted" : "unmuted";
  const toLabel = params.toMuted ? "muted" : "unmuted";
  voiceProdLog(
    `[voice-ui] mute-toggle from=${fromLabel} to=${toLabel} ` +
      `userMuted=${params.toMuted ? 1 : 0} ref=${params.refMuted ? 1 : 0}`
  );
}

export function logVoiceUiUserMutedState(params: {
  userMuted: boolean;
  refMuted: boolean;
  prevMuted?: boolean | null;
  source: string;
  micReady?: boolean;
  localStreamReady?: boolean;
}) {
  const prev =
    params.prevMuted == null ? "-" : params.prevMuted ? "1" : "0";
  voiceProdLog(
    `[voice-ui] userMuted-state source=${params.source} ` +
      `userMuted=${params.userMuted ? 1 : 0} ref=${params.refMuted ? 1 : 0} ` +
      `match=${params.userMuted === params.refMuted ? 1 : 0} prev=${prev}` +
      (params.micReady != null ? ` micReady=${params.micReady ? 1 : 0}` : "") +
      (params.localStreamReady != null
        ? ` localStreamReady=${params.localStreamReady ? 1 : 0}`
        : "")
  );
}

export function logTrackEnabledSet(params: {
  enabled: boolean;
  prev: boolean;
  reason: string;
  trackId?: string | null;
}) {
  debugConsoleLog(
    `[local-mic] track-enabled-set enabled=${params.enabled} prev=${params.prev} ` +
      `reason=${params.reason} trackId=${compactMicTrackId(params.trackId)}`
  );
}

export function logRestoreMutedState(params: {
  stored: boolean | null;
  userMutedBefore: boolean;
  userMutedAfter: boolean;
  trackEnabledBefore: boolean | null;
  trackEnabledAfter: boolean | null;
  reason: string;
}) {
  debugConsoleLog(
    `[local-mic] restore-muted-state stored=${params.stored ?? "-"} ` +
      `userMutedBefore=${params.userMutedBefore} userMutedAfter=${params.userMutedAfter} ` +
      `trackEnabledBefore=${params.trackEnabledBefore ?? "-"} ` +
      `trackEnabledAfter=${params.trackEnabledAfter ?? "-"} reason=${params.reason}`
  );
}

export function applyUserMutedToTrack(
  track: MediaStreamTrack,
  userMuted: boolean,
  reason: string,
  source: string
): void {
  const enabled = !userMuted;
  const prevEnabled = track.enabled;
  if (prevEnabled === enabled) return;

  track.enabled = enabled;
  logTrackEnabledSet({
    enabled,
    prev: prevEnabled,
    reason,
    trackId: track.id,
  });
  logMuteStateSet({
    userMuted,
    prev: !prevEnabled,
    reason,
    source,
  });
}
