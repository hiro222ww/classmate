"use client";

import { formatVoiceModeSuffix } from "@/lib/voiceClientEnv";
import {
  debugConsoleLog,
  debugVoiceLog,
  isDebugVoiceEnabled,
} from "@/lib/debugVoiceLog";

import { installCallLifecycleDiagnostics as installCallLifecycleDiagnosticsImpl } from "@/lib/callLifecycle";
import { recordCallReloadContext } from "@/lib/callReloadDiagnostics";

type PeerMediaSnapshot = {
  remoteTracksCount: number;
  hasRemoteStream: boolean;
};

type PeerConnectionSnapshot = PeerMediaSnapshot & {
  connectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
  signalingState: RTCSignalingState | null;
  iceGatheringState: RTCIceGatheringState | null;
};

export function isVoiceLayerDebugEnabled() {
  return isDebugVoiceEnabled();
}

export function voiceDebugLog(
  tag: string,
  payload: Record<string, unknown>
) {
  debugVoiceLog("voice", tag, { ...payload, timestamp: Date.now() });
}

function withBase(
  sessionId: string,
  localDeviceId: string,
  remoteDeviceId: string,
  extra?: Record<string, unknown>
) {
  return {
    sessionId,
    localDeviceId,
    remoteDeviceId,
    timestamp: Date.now(),
    ...extra,
  };
}

export function snapshotPeerConnection(
  pc: RTCPeerConnection | null | undefined,
  media: PeerMediaSnapshot
): PeerConnectionSnapshot {
  return {
    connectionState: pc?.connectionState ?? null,
    iceConnectionState: pc?.iceConnectionState ?? null,
    signalingState: pc?.signalingState ?? null,
    iceGatheringState: pc?.iceGatheringState ?? null,
    remoteTracksCount: media.remoteTracksCount,
    hasRemoteStream: media.hasRemoteStream,
  };
}

export function logPeerStateChange(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  field:
    | "connectionState"
    | "iceConnectionState"
    | "signalingState"
    | "iceGatheringState"
    | "remoteTracksCount"
    | "hasRemoteStream";
  previous: string | number | boolean | null;
  next: string | number | boolean | null;
  pc?: RTCPeerConnection | null;
  media?: PeerMediaSnapshot;
}) {
  debugConsoleLog("[voice-peer] state-change", {
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    field: params.field,
    previous: params.previous,
    next: params.next,
    ...(params.pc && params.media
      ? snapshotPeerConnection(params.pc, params.media)
      : {}),
  });
}

export function logPeerStateWarning(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  reason:
    | "disconnected"
    | "failed"
    | "closed"
    | "checking_timeout"
    | "connecting_timeout";
  pc?: RTCPeerConnection | null;
  media: PeerMediaSnapshot;
}) {
  const snap = snapshotPeerConnection(params.pc, params.media);
  const compact = `[voice-peer] warn remote=${compactDeviceId(params.remoteDeviceId)} reason=${params.reason} conn=${snap.connectionState ?? "-"} ice=${snap.iceConnectionState ?? "-"}`;

  recordCallReloadContext({ lastPeerWarning: compact });

  console.warn(compact);
  debugConsoleLog("[voice-peer] state-warning", {
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    reason: params.reason,
    ...snap,
  });
}

export function logRemoteTrackEvent(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  event: "ontrack" | "mute" | "unmute" | "ended";
  trackKind: string;
  trackId: string;
  trackReadyState?: string | null;
  trackMuted?: boolean | null;
  connectionState?: RTCPeerConnectionState | null;
  iceConnectionState?: RTCIceConnectionState | null;
  signalingState?: RTCSignalingState | null;
  otherPeersSnapshot?: string | null;
  elapsedMsSinceTrackEnded?: number;
  scheduledReconnectInMs?: number;
  reconnectScheduled?: boolean;
}) {
  const remote = compactDeviceId(params.remoteDeviceId);

  const compact =
    params.event === "ended"
      ? `[voice-peer] remote-track event=ended remote=${remote} ${formatVoiceModeSuffix()} ` +
        `trackReady=${params.trackReadyState ?? "-"} trackMuted=${params.trackMuted ?? "-"} ` +
        `conn=${params.connectionState ?? "-"} ice=${params.iceConnectionState ?? "-"} ` +
        `sig=${params.signalingState ?? "-"} otherPeers=${params.otherPeersSnapshot ?? "-"}`
      : `[voice-peer] track remote=${remote} ` +
        `event=${params.event} kind=${params.trackKind} id=${params.trackId.slice(-6)} ` +
        formatVoiceModeSuffix();

  recordCallReloadContext({ lastRemoteTrackEvent: compact });

  debugConsoleLog(compact);
  debugConsoleLog("[voice-peer] remote-track", {
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    event: params.event,
    trackKind: params.trackKind,
    trackId: params.trackId,
    ...(params.trackReadyState != null
      ? { trackReadyState: params.trackReadyState }
      : {}),
    ...(params.trackMuted != null ? { trackMuted: params.trackMuted } : {}),
    ...(params.connectionState != null
      ? { connectionState: params.connectionState }
      : {}),
    ...(params.iceConnectionState != null
      ? { iceConnectionState: params.iceConnectionState }
      : {}),
    ...(params.signalingState != null
      ? { signalingState: params.signalingState }
      : {}),
    ...(params.otherPeersSnapshot != null
      ? { otherPeersSnapshot: params.otherPeersSnapshot }
      : {}),
    ...(params.elapsedMsSinceTrackEnded != null
      ? { elapsedMsSinceTrackEnded: params.elapsedMsSinceTrackEnded }
      : {}),
    ...(params.scheduledReconnectInMs != null
      ? { scheduledReconnectInMs: params.scheduledReconnectInMs }
      : {}),
    ...(params.reconnectScheduled != null
      ? { reconnectScheduled: params.reconnectScheduled }
      : {}),
  });
}

export function logHealPeerAction(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  healRun: number;
  action: string;
  reason: string;
  pc?: RTCPeerConnection | null;
  media: PeerMediaSnapshot;
  scheduledInMs?: number;
  repeatWarning?: boolean;
}) {
  const snap = snapshotPeerConnection(params.pc, params.media);
  const payload = {
    healRun: params.healRun,
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    action: params.action,
    reason: params.reason,
    previousConnectionState: snap.connectionState,
    previousIceConnectionState: snap.iceConnectionState,
    previousSignalingState: snap.signalingState,
    remoteTracksCount: snap.remoteTracksCount,
    hasRemoteStream: snap.hasRemoteStream,
    ...(params.scheduledInMs != null
      ? { scheduledInMs: params.scheduledInMs }
      : {}),
  };

  const compact =
    `[voice-peer] heal remote=${compactDeviceId(params.remoteDeviceId)} ` +
    `action=${params.action} reason=${params.reason} ${formatVoiceModeSuffix()}`;

  recordCallReloadContext({ lastHealAction: compact });

  if (params.repeatWarning) {
    console.warn(compact);
    debugConsoleLog("[voice-peer] healRun", payload);
  } else {
    debugConsoleLog(compact);
    debugConsoleLog("[voice-peer] healRun", payload);
  }
}

export function logHealRecoverySuccess(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  remoteTracksCount: number;
  elapsedMs: number;
  recoveryVia?: "connected" | "ontrack" | "unmute";
  elapsedMsSinceTrackEnded?: number;
}) {
  debugConsoleLog("[voice-peer] heal-recovered", {
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    remoteDeviceId: params.remoteDeviceId,
    connectionState: params.connectionState,
    iceConnectionState: params.iceConnectionState,
    remoteTracksCount: params.remoteTracksCount,
    elapsedMs: params.elapsedMs,
    ...(params.recoveryVia ? { recoveryVia: params.recoveryVia } : {}),
    ...(params.elapsedMsSinceTrackEnded != null
      ? { elapsedMsSinceTrackEnded: params.elapsedMsSinceTrackEnded }
      : {}),
  });
}

export function logCallLifecycle(
  event: string,
  params: {
    sessionId: string;
    deviceId: string;
    persisted?: boolean;
    visibilityState?: DocumentVisibilityState;
    extra?: Record<string, unknown>;
  }
) {
  const visibilityState =
    params.visibilityState ??
    (typeof document !== "undefined" ? document.visibilityState : undefined);

  debugConsoleLog(
    `[call-lifecycle] event=${event} vis=${visibilityState ?? "-"} ` +
      `session=${compactSessionId(params.sessionId)} ` +
      `device=${compactDeviceId(params.deviceId)}` +
      (params.persisted != null ? ` persisted=${params.persisted}` : "")
  );

  debugConsoleLog("[call-lifecycle]", {
    event,
    sessionId: params.sessionId,
    deviceId: params.deviceId,
    visibilityState:
      params.visibilityState ??
      (typeof document !== "undefined"
        ? document.visibilityState
        : undefined),
    ...(params.persisted != null ? { persisted: params.persisted } : {}),
    timestamp: Date.now(),
    ...params.extra,
  });
}

export function logCallNavigationType(params: {
  sessionId: string;
  deviceId: string;
}) {
  if (typeof performance === "undefined") return;

  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;

  debugConsoleLog("[call-lifecycle] navigation", {
    type: entry?.type ?? "unknown",
    sessionId: params.sessionId,
    deviceId: params.deviceId,
    timestamp: Date.now(),
  });

  debugConsoleLog(
    `[call-lifecycle] navigation type=${entry?.type ?? "unknown"} ` +
      `session=${compactSessionId(params.sessionId)} ` +
      `device=${compactDeviceId(params.deviceId)}`
  );
}

function getNavigationTypeForDiagnostics(): string {
  if (typeof performance === "undefined") return "unknown";
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? "unknown";
}

export function compactDeviceId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 4) return value;
  return value.slice(-3);
}

export type PeerStatusDiagnostics = {
  hasPc: boolean;
  conn: string;
  ice: string;
  sig: string;
  hasRemoteStream: boolean;
  remoteTracksCount: number;
  trackReady: string;
  isRemoteInCall: boolean;
  lastPlaybackActiveAt: number | null;
  lastPlaybackConfirmedAt: number | null;
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
  lastPlaySuccessAt?: number | null;
  remoteAudioMounted: boolean;
  orphanRemoteAudio?: boolean;
  liveStreamHealHold?: boolean;
  p2pDirectFailedHoldActive?: boolean;
  p2pDirectFailedHoldRemainingMs?: number | null;
  autoHardResetInProgress?: boolean;
  autoHardResetGiveUp?: boolean;
  autoHardResetAttempts?: number;
  reconnectRequestSent?: boolean;
  reconnectRequestPending?: boolean;
  transportUnconfirmed?: boolean;
  p2pRetryActive?: boolean;
  p2pRetryExhausted?: boolean;
};

const remoteAudioPipelineLogAt = new Map<string, number>();
const REMOTE_AUDIO_PIPELINE_LOG_THROTTLE_MS = 4000;

type RemoteAudioPipelinePeerContext = {
  hasPc: boolean;
  conn: string;
  ice: string;
};

const remoteAudioPipelinePeerContext = new Map<
  string,
  RemoteAudioPipelinePeerContext
>();

export function setRemoteAudioPipelinePeerContext(
  remoteDeviceId: string,
  context: RemoteAudioPipelinePeerContext
) {
  remoteAudioPipelinePeerContext.set(remoteDeviceId, context);
}

function getRemoteAudioPipelinePeerContext(
  remoteDeviceId: string
): RemoteAudioPipelinePeerContext {
  return (
    remoteAudioPipelinePeerContext.get(remoteDeviceId) ?? {
      hasPc: false,
      conn: "-",
      ice: "-",
    }
  );
}

export function logRemoteAudioPipeline(params: {
  remoteDeviceId: string;
  hasPc: boolean;
  conn: string;
  ice: string;
  hasStream: boolean;
  trackReady: string;
  ontrackAgeMs: number | null;
  attached: boolean;
  audioPaused: boolean | null;
  audioMuted: boolean | null;
  volume: number | null;
  readyState: number | null;
  playSuccessAgeMs: number | null;
  currentTime: number | null;
  advanced: boolean | null;
  level: number | null;
  audioActuallyPlaying: boolean;
  outputState: string;
}) {
  const key = params.remoteDeviceId;
  const now = Date.now();
  const prev = remoteAudioPipelineLogAt.get(key) ?? 0;
  if (now - prev < REMOTE_AUDIO_PIPELINE_LOG_THROTTLE_MS) return;
  remoteAudioPipelineLogAt.set(key, now);

  const peerCtx = getRemoteAudioPipelinePeerContext(params.remoteDeviceId);

  debugConsoleLog(
    `[remote-audio-pipeline] remote=${compactDeviceId(params.remoteDeviceId)} ` +
      `hasPc=${params.hasPc || peerCtx.hasPc} conn=${params.conn !== "-" ? params.conn : peerCtx.conn} ice=${params.ice !== "-" ? params.ice : peerCtx.ice} ` +
      `hasStream=${params.hasStream} trackReady=${params.trackReady} ` +
      `ontrackAgeMs=${params.ontrackAgeMs ?? "-"} attached=${params.attached} ` +
      `audioPaused=${params.audioPaused ?? "-"} audioMuted=${params.audioMuted ?? "-"} ` +
      `volume=${params.volume ?? "-"} readyState=${params.readyState ?? "-"} ` +
      `playSuccessAgeMs=${params.playSuccessAgeMs ?? "-"} currentTime=${params.currentTime ?? "-"} ` +
      `advanced=${params.advanced ?? "-"} level=${params.level ?? "-"} ` +
      `audioActuallyPlaying=${params.audioActuallyPlaying} outputState=${params.outputState}`
  );
}

export function logVoicePeerAutoRecover(params: {
  remoteId: string;
  action: "play_retry" | "reattach" | "reconnect";
  reason: string;
}) {
  debugConsoleLog(
    `[voice-peer] auto-recover remote=${compactDeviceId(params.remoteId)} ` +
      `action=${params.action} reason=${params.reason}`
  );
}

export function logCallStatusPeer(params: {
  localDeviceId: string;
  remoteDeviceId: string;
  label: string;
  status: string;
  peerState: string;
  effectivePeerState?: string;
  statusSource?: string;
  remoteAudioHealth: string;
  audioActuallyPlaying?: boolean;
  playSuccessAgeMs?: number | null;
  playFailedAgeMs?: number | null;
  audioLevel?: number | null;
  playbackActiveAgeMs?: number | null;
  showReconnectButton?: boolean;
  reconnectReason?: string;
  hasPc: boolean;
  conn: string;
  ice: string;
  sig: string;
  hasRemoteStream: boolean;
  remoteTracksCount: number;
  trackReady: string;
  isRemoteInCall: boolean;
  reason: string;
}) {
  const orphanPc =
    !params.hasPc && params.hasRemoteStream && params.remoteTracksCount > 0;

  debugConsoleLog(
    `[call-status-peer] local=${compactDeviceId(params.localDeviceId)} remote=${compactDeviceId(params.remoteDeviceId)} ` +
      `label=${params.label} status=${params.status} peerState=${params.effectivePeerState ?? params.peerState} ` +
      `statusSource=${params.statusSource ?? "-"} ` +
      `audioActuallyPlaying=${params.audioActuallyPlaying === true} ` +
      `playSuccessAgeMs=${params.playSuccessAgeMs ?? "-"} playFailedAgeMs=${params.playFailedAgeMs ?? "-"} ` +
      `audioLevel=${params.audioLevel ?? "-"} showReconnectButton=${params.showReconnectButton === true} ` +
      `reconnectReason=${params.reconnectReason ?? "-"} remoteAudioHealth=${params.remoteAudioHealth} ` +
      `playbackActiveAgeMs=${params.playbackActiveAgeMs ?? "-"} hasPc=${params.hasPc} ` +
      `${orphanPc ? "hasPc=false orphanPc=true " : ""}` +
      `conn=${params.conn} ice=${params.ice} sig=${params.sig} ` +
      `hasRemoteStream=${params.hasRemoteStream} remoteTracksCount=${params.remoteTracksCount} ` +
      `trackReady=${params.trackReady} isRemoteInCall=${params.isRemoteInCall} reason=${params.reason}`
  );
}

export function compactConnectionId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 8) return value;
  return value.slice(-8);
}

function formatSignalIgnoreReason(reason: string): string {
  if (reason === "stale_connection_id") return "connection_id_mismatch";
  if (reason === "missing_connection_id") return "connection_id_missing";
  return reason;
}

export function logVoiceSignalIgnored(params: {
  reason: string;
  type: string;
  remote: string;
  incomingConnectionId?: string | null;
  currentConnectionId?: string | null;
  expectedSessionId?: string | null;
  gotSessionId?: string | null;
  expectedTarget?: string | null;
  gotTarget?: string | null;
  pcExists?: boolean;
  sig?: string;
  conn?: string;
  ice?: string;
  hasRemoteStream?: boolean;
  tracks?: number;
}) {
  const reason = formatSignalIgnoreReason(params.reason);
  const parts = [
    `[voice-signal] ignored remote=${compactDeviceId(params.remote)} type=${params.type} reason=${reason}`,
  ];

  if (
    params.incomingConnectionId !== undefined ||
    params.currentConnectionId !== undefined
  ) {
    parts.push(
      `expected=${compactConnectionId(params.currentConnectionId)}`,
      `got=${compactConnectionId(params.incomingConnectionId)}`
    );
  }

  if (params.expectedSessionId !== undefined || params.gotSessionId !== undefined) {
    parts.push(
      `expectedSession=${compactSessionId(params.expectedSessionId)}`,
      `gotSession=${compactSessionId(params.gotSessionId)}`
    );
  }

  if (params.expectedTarget !== undefined || params.gotTarget !== undefined) {
    parts.push(
      `expectedTarget=${compactDeviceId(params.expectedTarget)}`,
      `gotTarget=${compactDeviceId(params.gotTarget)}`
    );
  }

  if (params.pcExists !== undefined) {
    parts.push(
      `pcExists=${params.pcExists === true}`,
      `sig=${params.sig ?? "-"}`,
      `conn=${params.conn ?? "-"}`,
      `ice=${params.ice ?? "-"}`,
      `hasRemoteStream=${params.hasRemoteStream === true}`,
      `tracks=${params.tracks ?? 0}`
    );
  }

  debugConsoleLog(parts.join(" "));
}

export function logVoicePeerRole(params: {
  localDeviceId: string;
  remoteDeviceId: string;
  role: "active" | "passive";
  reason: string;
  localGreater: boolean;
}) {
  debugConsoleLog(
    `[voice-peer-role] local=${compactDeviceId(params.localDeviceId)} ` +
      `remote=${compactDeviceId(params.remoteDeviceId)} ` +
      `role=${params.role} reason=${params.reason} ` +
      `localGreater=${params.localGreater}`
  );
}

export type VoicePeerPairLogInput = {
  remoteDeviceId: string;
  connectionId: string | null;
  role: "active" | "passive";
  policy: "relay" | "all";
  route: "turn" | "p2p" | "unknown";
  pcState: string;
  iceState: string;
  signalingState: string;
  offerSent: boolean;
  offerReceived: boolean;
  answerSent: boolean;
  answerReceived: boolean;
  iceSent: boolean;
  iceReceived: boolean;
  iceConnected: boolean;
  remoteTrackReceived: boolean;
  audioConfirmed: boolean;
  audioConfirmedStrict: boolean;
  lastSignalAt: number | null;
  lastIceAt?: number | null;
  lastTrackAt?: number | null;
  lastAudioAt: number | null;
  lastAudioConfirmedAt?: number | null;
  lastCloseReason?: string | null;
  selectedLocalCandidateType?: string | null;
  selectedRemoteCandidateType?: string | null;
  inboundDeltaBytes?: number;
  outboundDeltaBytes?: number;
  signalingIssue?: string | null;
  voiceClass: string;
  subClass?: string | null;
};

export function logVoicePeerPair(input: VoicePeerPairLogInput) {
  debugConsoleLog(
    `[voice-peer-pair] remote=${compactDeviceId(input.remoteDeviceId)} ` +
      `connectionId=${compactConnectionId(input.connectionId)} ` +
      `role=${input.role} policy=${input.policy} route=${input.route} ` +
      `pc=${input.pcState} ice=${input.iceState} signaling=${input.signalingState} ` +
      `offerSent=${input.offerSent} offerReceived=${input.offerReceived} ` +
      `answerSent=${input.answerSent} answerReceived=${input.answerReceived} ` +
      `iceSent=${input.iceSent} iceReceived=${input.iceReceived} ` +
      `iceConnected=${input.iceConnected} ` +
      `track=${input.remoteTrackReceived} audioStrict=${input.audioConfirmedStrict} ` +
      `lastSignalAt=${input.lastSignalAt ?? "-"} lastIceAt=${input.lastIceAt ?? "-"} ` +
      `lastTrackAt=${input.lastTrackAt ?? "-"} lastAudioAt=${input.lastAudioAt ?? "-"} ` +
      `lastAudioConfirmedAt=${input.lastAudioConfirmedAt ?? "-"} ` +
      `lastCloseReason=${input.lastCloseReason ?? "-"} ` +
      `selectedLocal=${input.selectedLocalCandidateType ?? "-"} ` +
      `selectedRemote=${input.selectedRemoteCandidateType ?? "-"} ` +
      `deltaIn=${input.inboundDeltaBytes ?? 0} deltaOut=${input.outboundDeltaBytes ?? 0} ` +
      `signalIssue=${input.signalingIssue ?? "-"} ` +
      `class=${input.voiceClass} sub=${input.subClass ?? "-"}`
  );
}

export function logVoiceOneWayAudio(params: {
  remoteDeviceId: string;
  iceConnected: boolean;
  remoteTrackReceived: boolean;
  audioConfirmed: boolean;
  remoteReportedAudioConfirmed?: boolean;
}) {
  debugConsoleLog(
    `[voice-peer] one-way-audio remote=${compactDeviceId(params.remoteDeviceId)} ` +
      `iceConnected=${params.iceConnected} ` +
      `remoteTrackReceived=${params.remoteTrackReceived} ` +
      `audioConfirmed=${params.audioConfirmed} ` +
      `remoteReportedAudioConfirmed=${params.remoteReportedAudioConfirmed ?? "-"} ` +
      `class=D`
  );
}

export function logVoiceSignalStaleAnswerRecover(params: {
  remote: string;
  incomingConnectionId: string;
  currentConnectionId: string | null;
  action: string;
}) {
  debugConsoleLog(
    `[voice-signal] stale-answer-recover remote=${compactDeviceId(params.remote)} ` +
      `incomingConnectionId=${compactConnectionId(params.incomingConnectionId)} ` +
      `currentConnectionId=${compactConnectionId(params.currentConnectionId)} ` +
      `action=${params.action}`
  );
}

export function logVoiceSignalStaleWarning(params: {
  type: string;
  remote: string;
  incomingConnectionId: string;
  currentConnectionId: string | null;
  pcExists: boolean;
  sig: string;
  conn: string;
  ice: string;
  hasRemoteStream: boolean;
  tracks: number;
}) {
  debugConsoleLog(
    `[voice-signal] stale-signal-warning type=${params.type} remote=${compactDeviceId(params.remote)} ` +
      `incomingConnectionId=${compactConnectionId(params.incomingConnectionId)} ` +
      `currentConnectionId=${compactConnectionId(params.currentConnectionId)} ` +
      `pcExists=${params.pcExists} sig=${params.sig} conn=${params.conn} ice=${params.ice} ` +
      `hasRemoteStream=${params.hasRemoteStream} tracks=${params.tracks} action=accept_with_sync`
  );
}

export function logVoiceSignalOfferReceived(params: {
  from: string;
  to: string;
  connectionId: string;
  currentConnectionId: string | null;
  sig: string;
}) {
  debugConsoleLog(
    `[voice-signal] offer-received from=${compactDeviceId(params.from)} to=${compactDeviceId(params.to)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} ` +
      `currentConnectionId=${compactConnectionId(params.currentConnectionId)} sig=${params.sig}`
  );
}

export function logVoiceSignalSetRemoteOfferStart(
  remoteId: string,
  sig: string
) {
  debugConsoleLog(
    `[voice-signal] set-remote-offer-start remote=${compactDeviceId(remoteId)} sig=${sig}`
  );
}

export function logVoiceSignalSetRemoteOfferDone(
  remoteId: string,
  sig: string
) {
  debugConsoleLog(
    `[voice-signal] set-remote-offer-done remote=${compactDeviceId(remoteId)} sig=${sig}`
  );
}

export function logVoiceSignalAnswerCreateStart(remoteId: string) {
  debugConsoleLog(
    `[voice-signal] answer-create-start remote=${compactDeviceId(remoteId)}`
  );
}

export function logVoiceSignalAnswerSent(
  remoteId: string,
  connectionId: string
) {
  debugConsoleLog(
    `[voice-signal] answer-sent remote=${compactDeviceId(remoteId)} connectionId=${compactConnectionId(connectionId)}`
  );
}

export function logVoiceSignalAnswerReceived(params: {
  remoteId: string;
  connectionId: string;
  currentConnectionId: string | null;
  sig: string;
}) {
  debugConsoleLog(
    `[voice-signal] answer-received remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} ` +
      `currentConnectionId=${compactConnectionId(params.currentConnectionId)} sig=${params.sig}`
  );
}

function compactSessionId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 8) return value;
  return value.slice(-8);
}

function compactAgeMs(ts: number | null | undefined): string {
  if (ts == null) return "-";
  const ageSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return `${ageSec}s`;
}

function compactBool(value: boolean): string {
  return value ? "true" : "false";
}

function formatVoiceMeshPeerLine(peer: VoiceMeshPeerSummaryEntry): string {
  const remote = compactDeviceId(peer.remoteDeviceId);

  if (!peer.pcExists) {
    const inCall = peer.isInCall === true;
    const reason = inCall ? "missing_pc" : "no_pc";
    return `[voice-mesh] peer remote=${remote} pc=false inCall=${compactBool(inCall)} reason=${reason}`;
  }

  const confirmedAgeMs =
    peer.lastPlaybackConfirmedAt != null
      ? Math.max(0, Date.now() - peer.lastPlaybackConfirmedAt)
      : null;

  return (
    `[voice-mesh] peer remote=${remote} ` +
    `pc=true conn=${peer.connectionState ?? "-"} ` +
    `ice=${peer.iceConnectionState ?? "-"} ` +
    `sig=${peer.signalingState ?? "-"} ` +
    `tracks=${peer.remoteTracksCount} ` +
    `stream=${compactBool(peer.hasRemoteStream)} ` +
    `owner=${compactBool(peer.isOfferOwner)} ` +
    `offered=${compactBool(peer.weOffered)} ` +
    `offerAt=${compactAgeMs(peer.lastOfferAt)} ` +
    `answerAt=${compactAgeMs(peer.lastAnswerAt)} ` +
    `iceAt=${compactAgeMs(peer.lastIceCandidateAt)} ` +
    `ontrackAt=${compactAgeMs(peer.lastOnTrackAt)} ` +
    `playAt=${compactAgeMs(peer.lastPlaySuccessAt)} ` +
    `playbackAt=${compactAgeMs(peer.lastPlaybackActiveAt)} ` +
    `confirmedAt=${peer.lastPlaybackConfirmedAt != null ? compactAgeMs(peer.lastPlaybackConfirmedAt) : "-"} ` +
    `confirmedAgeMs=${confirmedAgeMs ?? "-"} ` +
    `block=${peer.reconnectBlockReason ?? "-"}`
  );
}

function formatVoiceMeshSummaryHeader(params: VoiceMeshPeerSummaryParams): string {
  const pcCount = params.peers.filter((peer) => peer.pcExists).length;
  return (
    `[voice-mesh] summary trigger=${params.trigger} ` +
    `members=${params.memberDeviceIds.length} ` +
    `inCall=${params.inCallMemberDeviceIds.length} ` +
    `peers=${params.peers.length} pc=${pcCount} ` +
    `session=${compactSessionId(params.sessionId)} ` +
    `local=${compactDeviceId(params.localDeviceId)} ` +
    formatVoiceModeSuffix()
  );
}

function formatVoiceMeshWarningLine(
  reason: string,
  trigger: string,
  sessionId: string,
  localDeviceId: string,
  extra?: Record<string, unknown>
): string {
  const parts = [
    `[voice-mesh] warn reason=${reason}`,
    `trigger=${trigger}`,
    `session=${compactSessionId(sessionId)}`,
    `local=${compactDeviceId(localDeviceId)}`,
  ];

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value == null) continue;
      if (key === "remoteDeviceId") {
        parts.push(`remote=${compactDeviceId(String(value))}`);
        continue;
      }
      if (typeof value === "boolean") {
        parts.push(`${key}=${compactBool(value)}`);
      } else if (typeof value === "number") {
        parts.push(`${key}=${value}`);
      } else {
        parts.push(`${key}=${String(value)}`);
      }
    }
  }

  return parts.join(" ");
}

export type VoiceMeshPeerSummaryEntry = {
  remoteDeviceId: string;
  memberExists: boolean;
  isInCall: boolean;
  isOfferOwner: boolean;
  pcExists: boolean;
  signalingState: RTCSignalingState | null;
  connectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
  iceGatheringState: RTCIceGatheringState | null;
  hasLocalTrack: boolean;
  hasRemoteStream: boolean;
  remoteTracksCount: number;
  remoteAudioTrackReadyState: MediaStreamTrackState | null;
  remoteAudioTrackMuted: boolean | null;
  weOffered: boolean;
  reconnectPending: boolean;
  reconnectBlockReason: string | null;
  pendingIceCount: number;
  connectStartedAt: number | null;
  msSinceConnectStart: number | null;
  lastOfferAt: number | null;
  lastAnswerAt: number | null;
  lastIceCandidateAt: number | null;
  lastOnTrackAt: number | null;
  lastUnmuteAt: number | null;
  lastPlaySuccessAt: number | null;
  lastPlaybackActiveAt: number | null;
  lastPlaybackConfirmedAt: number | null;
  lastWarning: string | null;
  lastHealAction: string | null;
};

export type VoiceMeshPeerSummaryParams = {
  trigger: string;
  sessionId: string;
  localDeviceId: string;
  memberDeviceIds: string[];
  inCallMemberDeviceIds: string[];
  peers: VoiceMeshPeerSummaryEntry[];
};

export function logVoiceMeshPeerSummary(
  params: VoiceMeshPeerSummaryParams,
  onAfterPeerLines?: (peers: VoiceMeshPeerSummaryEntry[]) => void
) {
  const header = formatVoiceMeshSummaryHeader(params);
  recordCallReloadContext({ lastMeshSummary: header });

  debugConsoleLog(header);
  for (const peer of params.peers) {
    debugConsoleLog(formatVoiceMeshPeerLine(peer));
  }

  onAfterPeerLines?.(params.peers);

  debugConsoleLog("[voice-mesh] peer-summary", {
    ...params,
    membersCount: params.memberDeviceIds.length,
    inCallMembersCount: params.inCallMemberDeviceIds.length,
    peerConnectionCount: params.peers.filter((p) => p.pcExists).length,
    timestamp: Date.now(),
  });
}

export function checkVoiceMeshExpectations(params: VoiceMeshPeerSummaryParams) {
  const {
    trigger,
    sessionId,
    localDeviceId,
    memberDeviceIds,
    inCallMemberDeviceIds,
    peers,
  } = params;

  const expectedFromMembers = Math.max(0, memberDeviceIds.length - 1);
  const expectedFromInCall = Math.max(
    0,
    inCallMemberDeviceIds.filter((id) => id !== localDeviceId).length
  );
  const pcCount = peers.filter((p) => p.pcExists).length;
  const now = Date.now();

  const warn = (reason: string, extra?: Record<string, unknown>) => {
    console.warn(
      formatVoiceMeshWarningLine(reason, trigger, sessionId, localDeviceId, extra)
    );
    debugConsoleLog("[voice-mesh] mesh-warning", {
      reason,
      trigger,
      sessionId,
      localDeviceId,
      expectedFromMembers,
      expectedFromInCall,
      peerConnectionCount: pcCount,
      timestamp: now,
      ...extra,
    });
  };

  if (expectedFromInCall > 0 && pcCount !== expectedFromInCall) {
    warn("in_call_peer_count_mismatch", {
      expectedFromInCall,
      peerConnectionCount: pcCount,
    });
  }

  if (memberDeviceIds.length >= 3) {
    const remotePeers = memberDeviceIds.filter((id) => id !== localDeviceId);
    const expectedPairs =
      (memberDeviceIds.length * (memberDeviceIds.length - 1)) / 2;
    const missingPc = remotePeers.filter(
      (id) => !peers.some((p) => p.remoteDeviceId === id && p.pcExists)
    );
    const missingAudio = remotePeers.filter((id) => {
      const peer = peers.find((p) => p.remoteDeviceId === id);
      if (!peer?.pcExists) return false;
      return (
        peer.lastPlaybackConfirmedAt == null &&
        peer.lastOnTrackAt == null &&
        !peer.hasRemoteStream
      );
    });
    warn("mesh_pair_matrix", {
      memberCount: memberDeviceIds.length,
      expectedPairs,
      peerConnectionCount: pcCount,
      missingPc: missingPc.map((id) => compactDeviceId(id)).join(",") || "-",
      missingAudio:
        missingAudio.map((id) => compactDeviceId(id)).join(",") || "-",
    });
  }

  for (const peer of peers) {
    const {
      remoteDeviceId,
      isInCall,
      pcExists,
      connectionState,
      hasRemoteStream,
      remoteTracksCount,
      signalingState,
      isOfferOwner,
      weOffered,
      lastOfferAt,
      lastAnswerAt,
      lastIceCandidateAt,
      lastOnTrackAt,
      msSinceConnectStart,
      reconnectBlockReason,
      reconnectPending,
    } = peer;

    if (isInCall === true && !pcExists) {
      warn("in_call_member_missing_pc", { remoteDeviceId, isOfferOwner });
    }

    if (pcExists && remoteTracksCount === 0) {
      warn("pc_without_remote_tracks", {
        remoteDeviceId,
        connectionState,
        signalingState,
      });
    }

    if (pcExists && connectionState === "connected" && !hasRemoteStream) {
      warn("connected_pc_without_remote_stream", {
        remoteDeviceId,
        signalingState,
      });
    }

    if (
      pcExists &&
      msSinceConnectStart != null &&
      msSinceConnectStart >= 10000 &&
      connectionState !== "connected" &&
      !lastOnTrackAt
    ) {
      warn("not_connected_after_10s", {
        remoteDeviceId,
        connectionState,
        signalingState,
        msSinceConnectStart,
        reconnectPending,
        reconnectBlockReason,
      });
    }

    if (
      pcExists &&
      msSinceConnectStart != null &&
      msSinceConnectStart >= 10000 &&
      !lastOnTrackAt &&
      (connectionState === "connecting" || connectionState === "new")
    ) {
      warn("ontrack_missing_after_10s", {
        remoteDeviceId,
        connectionState,
        msSinceConnectStart,
      });
    }

    if (isOfferOwner && pcExists && signalingState === "stable" && !weOffered && !lastOfferAt) {
      warn("offer_owner_waiting_no_offer", { remoteDeviceId });
    }

    if (
      !isOfferOwner &&
      pcExists &&
      signalingState === "stable" &&
      !lastOfferAt &&
      msSinceConnectStart != null &&
      msSinceConnectStart >= 8000
    ) {
      warn("answerer_waiting_no_remote_offer", {
        remoteDeviceId,
        msSinceConnectStart,
      });
    }

    if (
      isOfferOwner &&
      weOffered &&
      signalingState === "have-local-offer" &&
      !lastAnswerAt &&
      msSinceConnectStart != null &&
      msSinceConnectStart >= 10000
    ) {
      warn("offer_without_answer", {
        remoteDeviceId,
        lastOfferAt,
      });
    }

    if (
      pcExists &&
      (signalingState === "have-local-offer" ||
        signalingState === "have-remote-offer") &&
      !lastIceCandidateAt &&
      msSinceConnectStart != null &&
      msSinceConnectStart >= 8000
    ) {
      warn("signaling_without_ice", {
        remoteDeviceId,
        signalingState,
        msSinceConnectStart,
      });
    }

    if (isOfferOwner && signalingState === "have-remote-offer" && weOffered) {
      warn("possible_offer_glare", {
        remoteDeviceId,
        signalingState,
        weOffered,
      });
    }

    if (reconnectBlockReason === "reconnect_already_scheduled" && !lastOnTrackAt) {
      warn("reconnect_blocked_no_stream", {
        remoteDeviceId,
        reconnectBlockReason,
      });
    }

    if (reconnectBlockReason === "heal_cooldown" && !lastOnTrackAt && pcExists) {
      warn("heal_cooldown_blocking_recovery", {
        remoteDeviceId,
        reconnectBlockReason,
        msSinceConnectStart,
      });
    }
  }
}

export function installCallPageDiagnostics(params: {
  sessionId: string;
  deviceId: string;
  onBfcacheRestore?: (args: { sessionId: string; deviceId: string }) => void;
}) {
  return installCallLifecycleDiagnosticsImpl(params);
}
