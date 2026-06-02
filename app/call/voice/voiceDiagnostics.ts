"use client";

import { formatVoiceModeSuffix } from "@/lib/voiceClientEnv";

import {
  consumeCallBfcacheSuspend,
  isLikelyChunkLoadError,
  markCallBfcacheSuspend,
  recordCallReloadContext,
  saveCallReloadSnapshot,
} from "@/lib/callReloadDiagnostics";

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
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_VOICE_DEBUG === "true") return true;

  try {
    return localStorage.getItem("voice_debug") === "1";
  } catch {
    return false;
  }
}

export function voiceDebugLog(
  tag: string,
  payload: Record<string, unknown>
) {
  if (!isVoiceLayerDebugEnabled()) return;
  console.log(tag, { ...payload, timestamp: Date.now() });
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
  console.log("[voice-peer] state-change", {
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
  console.warn("[voice-peer] state-warning", {
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

  console.log(compact);
  console.log("[voice-peer] remote-track", {
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
    console.warn("[voice-peer] healRun", payload);
  } else {
    console.log(compact);
    console.log("[voice-peer] healRun", payload);
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
  console.log("[voice-peer] heal-recovered", {
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

  console.log(
    `[call-lifecycle] event=${event} vis=${visibilityState ?? "-"} ` +
      `session=${compactSessionId(params.sessionId)} ` +
      `device=${compactDeviceId(params.deviceId)}` +
      (params.persisted != null ? ` persisted=${params.persisted}` : "")
  );

  console.log("[call-lifecycle]", {
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

  console.log("[call-lifecycle] navigation", {
    type: entry?.type ?? "unknown",
    sessionId: params.sessionId,
    deviceId: params.deviceId,
    timestamp: Date.now(),
  });

  console.log(
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
  remoteAudioMounted: boolean;
  orphanRemoteAudio?: boolean;
  p2pDirectFailedHoldActive?: boolean;
  p2pDirectFailedHoldRemainingMs?: number | null;
  autoHardResetInProgress?: boolean;
  autoHardResetGiveUp?: boolean;
  autoHardResetAttempts?: number;
};

export function logCallStatusPeer(params: {
  localDeviceId: string;
  remoteDeviceId: string;
  label: string;
  status: string;
  peerState: string;
  effectivePeerState?: string;
  remoteAudioHealth: string;
  playbackActiveAgeMs?: number | null;
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

  console.log(
    `[call-status-peer] local=${compactDeviceId(params.localDeviceId)} remote=${compactDeviceId(params.remoteDeviceId)} ` +
      `label=${params.label} status=${params.status} peerState=${params.effectivePeerState ?? params.peerState} ` +
      `remoteAudioHealth=${params.remoteAudioHealth} ` +
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

export function logVoiceSignalIgnored(params: {
  reason: string;
  type: string;
  remote: string;
  incomingConnectionId?: string | null;
  currentConnectionId?: string | null;
  pcExists?: boolean;
  sig?: string;
  conn?: string;
  ice?: string;
  hasRemoteStream?: boolean;
  tracks?: number;
}) {
  const parts = [
    `[voice-signal] ignored reason=${params.reason} type=${params.type} remote=${compactDeviceId(params.remote)}`,
  ];

  if (params.incomingConnectionId !== undefined) {
    parts.push(
      `incomingConnectionId=${compactConnectionId(params.incomingConnectionId)}`,
      `currentConnectionId=${compactConnectionId(params.currentConnectionId)}`,
      `pcExists=${params.pcExists === true}`,
      `sig=${params.sig ?? "-"}`,
      `conn=${params.conn ?? "-"}`,
      `ice=${params.ice ?? "-"}`,
      `hasRemoteStream=${params.hasRemoteStream === true}`,
      `tracks=${params.tracks ?? 0}`
    );
  }

  console.log(parts.join(" "));
}

export function logVoiceSignalStaleAnswerRecover(params: {
  remote: string;
  incomingConnectionId: string;
  currentConnectionId: string | null;
  action: string;
}) {
  console.log(
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
  console.log(
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
  console.log(
    `[voice-signal] offer-received from=${compactDeviceId(params.from)} to=${compactDeviceId(params.to)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} ` +
      `currentConnectionId=${compactConnectionId(params.currentConnectionId)} sig=${params.sig}`
  );
}

export function logVoiceSignalSetRemoteOfferStart(
  remoteId: string,
  sig: string
) {
  console.log(
    `[voice-signal] set-remote-offer-start remote=${compactDeviceId(remoteId)} sig=${sig}`
  );
}

export function logVoiceSignalSetRemoteOfferDone(
  remoteId: string,
  sig: string
) {
  console.log(
    `[voice-signal] set-remote-offer-done remote=${compactDeviceId(remoteId)} sig=${sig}`
  );
}

export function logVoiceSignalAnswerCreateStart(remoteId: string) {
  console.log(
    `[voice-signal] answer-create-start remote=${compactDeviceId(remoteId)}`
  );
}

export function logVoiceSignalAnswerSent(
  remoteId: string,
  connectionId: string
) {
  console.log(
    `[voice-signal] answer-sent remote=${compactDeviceId(remoteId)} connectionId=${compactConnectionId(connectionId)}`
  );
}

export function logVoiceSignalAnswerReceived(params: {
  remoteId: string;
  connectionId: string;
  currentConnectionId: string | null;
  sig: string;
}) {
  console.log(
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
    const reason = peer.isInCall === true ? "missing_pc" : "no_pc";
    return `[voice-mesh] peer remote=${remote} pc=false inCall=${compactBool(peer.isInCall === true)} reason=${reason}`;
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
  isInCall: boolean | null;
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

  console.log(header);
  for (const peer of params.peers) {
    console.log(formatVoiceMeshPeerLine(peer));
  }

  onAfterPeerLines?.(params.peers);

  console.log("[voice-mesh] peer-summary", {
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
    console.warn(formatVoiceMeshWarningLine(reason, trigger, sessionId, localDeviceId, extra));
    console.warn("[voice-mesh] mesh-warning", {
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
  const { sessionId, deviceId, onBfcacheRestore } = params;

  const onError = (event: ErrorEvent) => {
    const message = event.message ?? "";
    const chunkError = isLikelyChunkLoadError(message);
    const compact = `[call-lifecycle] window-error chunk=${chunkError} msg=${message.slice(0, 120)}`;

    recordCallReloadContext({ lastError: compact });

    console.error(compact);
    console.error("[call-lifecycle] window-error", {
      message: event.message,
      chunkError,
      filename: event.filename ?? null,
      lineno: event.lineno ?? null,
      stack: event.error?.stack ?? null,
      timestamp: Date.now(),
      sessionId,
      deviceId,
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const chunkError = isLikelyChunkLoadError(message);
    const compact =
      `[call-lifecycle] unhandled-rejection chunk=${chunkError} ` +
      `name=${reason instanceof Error ? reason.name : typeof reason} msg=${message.slice(0, 120)}`;

    recordCallReloadContext({ lastRejection: compact });

    console.error(compact);
    console.error("[call-lifecycle] unhandled-rejection", {
      message,
      chunkError,
      stack: reason instanceof Error ? reason.stack : null,
      reason: reason instanceof Error ? reason.name : typeof reason,
      timestamp: Date.now(),
      sessionId,
      deviceId,
    });
  };

  const onPageHide = (event: PageTransitionEvent) => {
    logCallLifecycle("pagehide", {
      sessionId,
      deviceId,
      persisted: event.persisted,
    });

    if (event.persisted) {
      console.log(
        `[call-lifecycle] pagehide-persisted-skip-leave session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
      );
      markCallBfcacheSuspend(sessionId);
      return;
    }

    saveCallReloadSnapshot({
      trigger: "pagehide",
      sessionId,
      deviceId,
      persisted: event.persisted,
    });
  };

  const onPageShow = (event: PageTransitionEvent) => {
    console.log(
      `[call-lifecycle] pageshow persisted=${event.persisted} session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
    );
    logCallLifecycle("pageshow", {
      sessionId,
      deviceId,
      persisted: event.persisted,
      extra: { navigationType: getNavigationTypeForDiagnostics() },
    });

    if (event.persisted && consumeCallBfcacheSuspend(sessionId)) {
      console.log(
        `[call-lifecycle] bfcache-restore action=resume_call session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
      );
      onBfcacheRestore?.({ sessionId, deviceId });
    }
  };

  const onVisibilityChange = () => {
    logCallLifecycle("visibilitychange", {
      sessionId,
      deviceId,
      visibilityState: document.visibilityState,
    });
  };

  const onBeforeUnload = () => {
    logCallLifecycle("beforeunload", { sessionId, deviceId });
    saveCallReloadSnapshot({
      trigger: "beforeunload",
      sessionId,
      deviceId,
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
