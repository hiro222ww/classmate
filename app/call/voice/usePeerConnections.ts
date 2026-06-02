"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SignalPayload, SignalRow, SignalType } from "./useCallSignaling";
import {
  checkVoiceMeshExpectations,
  compactDeviceId,
  logHealPeerAction as emitHealPeerAction,
  logHealRecoverySuccess,
  logPeerStateChange,
  logPeerStateWarning,
  logRemoteTrackEvent,
  logVoiceMeshPeerSummary,
  logVoiceSignalAnswerCreateStart,
  logVoiceSignalAnswerReceived,
  logVoiceSignalAnswerSent,
  logVoiceSignalIgnored,
  logVoiceSignalOfferReceived,
  logVoiceSignalSetRemoteOfferDone,
  logVoiceSignalSetRemoteOfferStart,
  logVoiceSignalStaleAnswerRecover,
  logVoiceSignalStaleWarning,
  compactConnectionId,
  voiceDebugLog,
  type VoiceMeshPeerSummaryEntry,
  type PeerStatusDiagnostics,
} from "./voiceDiagnostics";
import { recordCallReloadContext } from "@/lib/callReloadDiagnostics";
import {
  formatVoiceModeSuffix,
  getVoiceModePolicy,
  logVoiceClientEnv,
} from "@/lib/voiceClientEnv";
import type { RemotePlaybackHealth } from "./RemoteAudio";
import {
  createEmptyPeerIceDiagnostics,
  evaluateInsufficientRemoteCandidates,
  hasNoRelayCandidates,
  logVoiceIceAddCandidateFailed,
  logVoiceIceP2pDirectFailed,
  logVoiceIceAddCandidateSuccess,
  logVoiceIceCheckingStuck,
  logVoiceIceGatheringComplete,
  logVoiceIceGatheringState,
  logVoiceIceInsufficientCandidates,
  logVoiceIceLocalCandidate,
  logVoiceIceRemoteCandidateReceived,
  recordLocalIceCandidate,
  recordRemoteIceCandidate,
  type PeerIceDiagnostics,
} from "./voiceIceDiagnostics";

type Member = {
  device_id: string;
  display_name: string;
  photo_path?: string | null;
  screen?: string | null;
  last_seen_at?: string | null;
  is_in_call?: boolean;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";
type VoiceRoute = "stun" | "turn";
type OsType = "windows" | "mac" | "ios" | "android" | "unknown";

type RemoteAudioState = {
  stream: MediaStream;
  member?: Member;
  attachSeq: number;
  replayReason?: string | null;
};

function getLocalAudioTrack(
  localAudioTrackRef: React.MutableRefObject<MediaStreamTrack | null>,
  localStreamRef: React.MutableRefObject<MediaStream | null>
): MediaStreamTrack | null {
  return (
    localAudioTrackRef.current ??
    localStreamRef.current?.getAudioTracks()[0] ??
    null
  );
}

function getLocalTrackReadyState(
  localAudioTrackRef: React.MutableRefObject<MediaStreamTrack | null>,
  localStreamRef: React.MutableRefObject<MediaStream | null>
): string {
  return getLocalAudioTrack(localAudioTrackRef, localStreamRef)?.readyState ?? "none";
}

function isLocalTrackLive(
  localAudioTrackRef: React.MutableRefObject<MediaStreamTrack | null>,
  localStreamRef: React.MutableRefObject<MediaStream | null>
): boolean {
  return getLocalAudioTrack(localAudioTrackRef, localStreamRef)?.readyState === "live";
}

type VoicePeerCleanupReason =
  | "component_unmount"
  | "session_changed"
  | "device_changed"
  | "deps_changed";

type VoicePeerCleanupLogTag = "cleanup-on-unmount" | "cleanup-effect";

type UsePeerConnectionsArgs = {
  sessionId: string;
  deviceId: string;
  members: Member[];
  membersSyncRevision?: number;
  isMuted: boolean;
  micReady: boolean;
  signalReady: boolean;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  localAudioTrackRef: React.MutableRefObject<MediaStreamTrack | null>;
  sendSignal: (
    toDeviceId: string | null,
    signalType: SignalType,
    payload: SignalPayload
  ) => Promise<void>;
  onRemoteCountChange?: (count: number) => void;
  onStatusChange?: (text: string) => void;
  onPeerStatesChange?: (states: Record<string, PeerState>) => void;
  onPeerDiagnosticsChange?: (
    diagnostics: Record<string, PeerStatusDiagnostics>
  ) => void;
  onVoiceCleanup?: () => void;
};

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

const voicePolicy = getVoiceModePolicy();
logVoiceClientEnv("peer-connections-init");

const MESH_SUMMARY_DEBOUNCE_MS = 150;
const TRACK_ENDED_HOLD_MS = 2000;
const TRACK_ENDED_RECENT_CONNECTED_MS = 5000;
const LIVE_STREAM_WAIT_CONNECTED_MS = 10000;
const PLAYBACK_ACTIVE_HOLD_MS = 15000;
const ICE_CHECKING_DIAGNOSTICS_MS = 10000;
const ICE_RESTART_STUCK_MS = 15000;
const ICE_RESTART_POST_TIMEOUT_MS = 10000;
const MAX_ICE_RESTART_ATTEMPTS = 1;
const P2P_DIRECT_FAILED_HOLD_MS = 60_000;
const ORPHAN_REMOTE_AUDIO_MS = 15000;

type ScheduleReconnectOpts = {
  reason: string;
  source: string;
  force?: boolean;
  callerHint?: string;
};

const UNSPECIFIED_RECONNECT_VALUES = new Set(["", "unspecified", "-"]);

function isUnspecifiedReconnectLabel(value: string | null | undefined): boolean {
  return UNSPECIFIED_RECONNECT_VALUES.has(String(value ?? "").trim());
}

function getReconnectCallerHint(explicit?: string): string {
  if (explicit) return explicit;
  const stack = new Error().stack;
  if (!stack) return "-";
  return stack.split("\n").slice(2, 5).join(" <- ").trim() || "-";
}

function isSelfInitiatedHealEnsureReason(reason: string): boolean {
  return (
    reason.startsWith("heal_") ||
    reason.includes("mesh_missing") ||
    reason.includes("safety_net") ||
    reason.includes("no_stream_no_offer")
  );
}

type TrackEndedHoldCheck = {
  shouldHold: boolean;
  reason: string;
  conn: string;
  ice: string;
  lastConnectedAgoMs: number | null;
  tracks: number;
  hasStream: boolean;
};

function evaluateTrackEndedHold(params: {
  pc: RTCPeerConnection | null | undefined;
  media: { hasLiveRemoteAudioStream: boolean; remoteTracksCount: number };
  lastConnectedAt?: number;
}): TrackEndedHoldCheck {
  const { pc, media, lastConnectedAt } = params;
  const conn = pc?.connectionState ?? "-";
  const ice = pc?.iceConnectionState ?? "-";
  const lastConnectedAgoMs =
    lastConnectedAt != null ? Date.now() - lastConnectedAt : null;
  const tracks = media.remoteTracksCount;
  const hasStream = media.hasLiveRemoteAudioStream;

  let shouldHold = false;
  let reason = "not_healthy";

  if (conn === "connected") {
    shouldHold = true;
    reason = "transport_connected";
  } else if (ice === "connected" || ice === "completed") {
    shouldHold = true;
    reason = "transport_connected";
  } else if (
    lastConnectedAgoMs != null &&
    lastConnectedAgoMs <= TRACK_ENDED_RECENT_CONNECTED_MS
  ) {
    shouldHold = true;
    reason = "recent_connected";
  } else if (hasStream || tracks > 0) {
    shouldHold = true;
    reason = "has_live_stream";
  }

  return { shouldHold, reason, conn, ice, lastConnectedAgoMs, tracks, hasStream };
}

function logTrackEndedHoldCheck(remoteId: string, check: TrackEndedHoldCheck) {
  console.log(
    `[voice-peer] track-ended-hold-check remote=${compactDeviceId(remoteId)} shouldHold=${check.shouldHold} reason=${check.reason} ` +
      `conn=${check.conn} ice=${check.ice} lastConnectedAgoMs=${check.lastConnectedAgoMs ?? "-"} ` +
      `tracks=${check.tracks} hasStream=${check.hasStream} ${formatVoiceModeSuffix()}`
  );
}
const CLOSE_FOR_RECONNECT = {
  clearConnectionId: false,
  preserveRemoteAudio: false,
  reason: "reconnect_clear_ended_audio",
} as const;

const PASSIVE_WAIT_OFFER_TIMEOUT_MS = 8000;
const NO_STREAM_NO_OFFER_FORCE_MS = 6000;

type StaleSignalRecoverAction = "accept_sync" | "warn_accept_sync" | "reject";

function isTransportStalledForStaleRecover(conn: string, ice: string): boolean {
  return (
    conn === "connecting" ||
    conn === "new" ||
    ice === "checking" ||
    ice === "new"
  );
}

function evaluateStaleSignalRecoverAction(params: {
  signalType: string;
  pc: RTCPeerConnection | null;
  remoteTracksCount: number;
  hasRemoteStream: boolean;
  confirmedAt: number | null;
}): StaleSignalRecoverAction {
  const { signalType, pc, remoteTracksCount, hasRemoteStream, confirmedAt } =
    params;

  if (!pc) return "reject";

  const sig = pc.signalingState;
  const conn = pc.connectionState;
  const ice = pc.iceConnectionState;
  const unconfirmed = confirmedAt == null;
  const noTracks = remoteTracksCount === 0 && !hasRemoteStream;

  if (!noTracks && !unconfirmed) return "reject";

  if (signalType === "answer" && sig === "have-local-offer") {
    if (isTransportStalledForStaleRecover(conn, ice) || conn === "connecting") {
      return "accept_sync";
    }
  }

  if (signalType === "ice") {
    if (
      (sig === "stable" ||
        sig === "have-local-offer" ||
        sig === "have-remote-offer") &&
      isTransportStalledForStaleRecover(conn, ice)
    ) {
      return "accept_sync";
    }
  }

  if (
    (sig === "have-local-offer" || sig === "stable") &&
    isTransportStalledForStaleRecover(conn, ice) &&
    (noTracks || unconfirmed)
  ) {
    return "warn_accept_sync";
  }

  return "reject";
}

function isIceConnectionStalled(ice: string): boolean {
  return ice === "new" || ice === "checking";
}

function isNoStreamNoOfferDeadlock(params: {
  pc: RTCPeerConnection | null | undefined;
  hasLiveRemoteStream: boolean;
  offered: boolean;
  hasRemoteStream: boolean;
  remoteTracksCount: number;
}): boolean {
  const {
    pc,
    hasLiveRemoteStream,
    offered,
    hasRemoteStream,
    remoteTracksCount,
  } = params;

  if (!pc || !isUsablePeerConnection(pc)) return false;
  if (hasLiveRemoteStream) return false;
  if (offered) return false;

  return (
    pc.connectionState === "new" &&
    isIceConnectionStalled(pc.iceConnectionState) &&
    pc.signalingState === "stable" &&
    !hasRemoteStream &&
    remoteTracksCount === 0
  );
}

function compactStreamId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 6) return value;
  return value.slice(-6);
}

function getRemoteStreamAudioSnapshot(stream: MediaStream | null | undefined) {
  const audioTracks = stream?.getAudioTracks() ?? [];
  const liveTracks = audioTracks.filter((track) => track.readyState === "live");
  return {
    primaryTrack: audioTracks[0] ?? null,
    hasLiveStream: liveTracks.length > 0,
    liveTrackCount: liveTracks.length,
    totalTrackCount: audioTracks.length,
  };
}

function isEndedStreamReconnectReason(reason: string): boolean {
  return (
    reason.includes("remote_track_ended") ||
    reason.includes("ended_stream") ||
    reason.includes("track_ended")
  );
}

function makeConnectionId(localId: string, remoteId: string) {
  return `${localId}__${remoteId}__${Date.now()}__${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function detectOs(): OsType {
  const ua =
    typeof navigator !== "undefined"
      ? navigator.userAgent.toLowerCase()
      : "";

  if (ua.includes("windows")) return "windows";
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  if (ua.includes("android")) return "android";
  if (ua.includes("mac")) return "mac";

  return "unknown";
}

type PeerSignalTimestamps = {
  lastOfferAt: number | null;
  lastAnswerAt: number | null;
  lastIceCandidateAt: number | null;
  lastOnTrackAt: number | null;
  lastUnmuteAt: number | null;
  lastPlaySuccessAt: number | null;
  lastPlaybackActiveAt: number | null;
  lastPlaybackConfirmedAt: number | null;
};

type LiveStreamWaitHoldReason =
  | "active_playback_wait_connected"
  | "recent_live_stream_wait_connected";

type LiveStreamWaitConnectedCheck = {
  shouldHold: boolean;
  graceExpired: boolean;
  holdReason: LiveStreamWaitHoldReason | null;
  isConnectingOrChecking: boolean;
  ontrackAgeMs: number | null;
  answerAgeMs: number | null;
  playAgeMs: number | null;
  playbackActiveAgeMs: number | null;
  unmuteAgeMs: number | null;
  activityAgeMs: number | null;
};

type PeerMeta = {
  lastWarning: string | null;
  lastHealAction: string | null;
};

function emptyPeerSignalTimestamps(): PeerSignalTimestamps {
  return {
    lastOfferAt: null,
    lastAnswerAt: null,
    lastIceCandidateAt: null,
    lastOnTrackAt: null,
    lastUnmuteAt: null,
    lastPlaySuccessAt: null,
    lastPlaybackActiveAt: null,
    lastPlaybackConfirmedAt: null,
  };
}

function signalAgeMs(at: number | null): number | null {
  if (at == null) return null;
  return Date.now() - at;
}

function isPcConnectingOrIceChecking(pc: RTCPeerConnection): boolean {
  return (
    pc.connectionState === "connecting" ||
    isIceConnectionStalled(pc.iceConnectionState)
  );
}

function evaluateLiveStreamWaitConnectedHold(params: {
  pc: RTCPeerConnection;
  timestamps: PeerSignalTimestamps;
  connectStartedAt: number | null | undefined;
  graceMs: number;
}): LiveStreamWaitConnectedCheck {
  const { pc, timestamps, connectStartedAt, graceMs } = params;
  const ontrackAgeMs = signalAgeMs(timestamps.lastOnTrackAt);
  const answerAgeMs = signalAgeMs(timestamps.lastAnswerAt);
  const playAgeMs = signalAgeMs(timestamps.lastPlaySuccessAt);
  const playbackActiveAgeMs = signalAgeMs(timestamps.lastPlaybackActiveAt);
  const playbackConfirmedAgeMs = signalAgeMs(timestamps.lastPlaybackConfirmedAt);
  const unmuteAgeMs = signalAgeMs(timestamps.lastUnmuteAt);

  const signalAnchors = [
    timestamps.lastOnTrackAt,
    timestamps.lastAnswerAt,
    timestamps.lastUnmuteAt,
    timestamps.lastPlaySuccessAt,
    connectStartedAt ?? null,
  ].filter((value): value is number => value != null);

  const latestSignalAt = signalAnchors.length ? Math.max(...signalAnchors) : null;
  const activityAgeMs = signalAgeMs(latestSignalAt);

  const isConnectingOrChecking = isPcConnectingOrIceChecking(pc);
  const withinSignalGrace =
    activityAgeMs != null && activityAgeMs < graceMs;
  const playbackRecentlyActive =
    playbackActiveAgeMs != null && playbackActiveAgeMs < PLAYBACK_ACTIVE_HOLD_MS;
  const playbackConfirmedRecently =
    playbackConfirmedAgeMs != null &&
    playbackConfirmedAgeMs < PLAYBACK_ACTIVE_HOLD_MS;

  let holdReason: LiveStreamWaitHoldReason | null = null;
  if (isConnectingOrChecking && (playbackConfirmedRecently || playbackRecentlyActive)) {
    holdReason = "active_playback_wait_connected";
  } else if (isConnectingOrChecking && withinSignalGrace) {
    holdReason = "recent_live_stream_wait_connected";
  }

  const signalGraceExpired =
    activityAgeMs != null && activityAgeMs >= graceMs;

  return {
    shouldHold: holdReason != null,
    graceExpired:
      isConnectingOrChecking &&
      signalGraceExpired &&
      !playbackRecentlyActive &&
      !playbackConfirmedRecently,
    holdReason,
    isConnectingOrChecking,
    ontrackAgeMs,
    answerAgeMs,
    playAgeMs,
    playbackActiveAgeMs,
    unmuteAgeMs,
    activityAgeMs,
  };
}

function getLiveStreamWaitConnectedCheckForPeer(params: {
  pc: RTCPeerConnection | null | undefined;
  hasLiveRemoteStream: boolean;
  remoteTracksCount: number;
  hasRemoteStream: boolean;
  timestamps: PeerSignalTimestamps;
  connectStartedAt: number | null | undefined;
}): LiveStreamWaitConnectedCheck | null {
  const { pc, hasLiveRemoteStream, remoteTracksCount, hasRemoteStream } = params;
  if (!pc || !isUsablePeerConnection(pc)) return null;

  const hasMedia =
    hasLiveRemoteStream || remoteTracksCount > 0 || hasRemoteStream;
  if (!hasMedia) return null;
  if (!isPcConnectingOrIceChecking(pc)) return null;

  return evaluateLiveStreamWaitConnectedHold({
    pc,
    timestamps: params.timestamps,
    connectStartedAt: params.connectStartedAt,
    graceMs: LIVE_STREAM_WAIT_CONNECTED_MS,
  });
}

function resolveGraceExpiredReconnectReason(baseReason: string): string {
  if (baseReason === "checking_timeout") return "checking_timeout_after_grace";
  if (baseReason === "connecting_timeout") return "connecting_timeout_after_grace";
  if (
    baseReason === "unspecified" ||
    baseReason === "heal_stream_without_connected_pc"
  ) {
    return "live_stream_not_connected_timeout";
  }
  return baseReason;
}

function formatReconnectHoldLog(
  remoteId: string,
  source: string,
  pc: RTCPeerConnection,
  tracks: number,
  check: LiveStreamWaitConnectedCheck
): string {
  const reason = check.holdReason ?? "recent_live_stream_wait_connected";
  return (
    `[voice-peer] reconnect-hold remote=${compactDeviceId(remoteId)} reason=${reason} source=${source} ` +
    `conn=${pc.connectionState} ice=${pc.iceConnectionState} tracks=${tracks} ` +
    `playbackActiveAgeMs=${check.playbackActiveAgeMs ?? "-"} playAgeMs=${check.playAgeMs ?? "-"} ` +
    `ontrackAgeMs=${check.ontrackAgeMs ?? "-"} activityAgeMs=${check.activityAgeMs ?? "-"} ${formatVoiceModeSuffix()}`
  );
}

async function detectConnectionType(pc: RTCPeerConnection) {
  const stats = await pc.getStats();

  let route: "turn" | "p2p" | "unknown" = "unknown";
  let localType: string | null = null;
  let remoteType: string | null = null;

  stats.forEach((report) => {
    if (report.type === "candidate-pair" && report.state === "succeeded") {
      const local = stats.get(report.localCandidateId);
      const remote = stats.get(report.remoteCandidateId);

      localType = local?.candidateType ?? null;
      remoteType = remote?.candidateType ?? null;

      if (localType === "relay" || remoteType === "relay") {
        route = "turn";
      } else if (localType || remoteType) {
        route = "p2p";
      }
    }
  });

  return { route, localType, remoteType };
}

type EnsurePeerConnectionOpts = {
  force?: boolean;
};

function isUsablePeerConnection(pc: RTCPeerConnection | null | undefined): boolean {
  if (!pc) return false;
  return pc.connectionState !== "closed" && pc.connectionState !== "failed";
}

function isPeerTransportHealthy(
  pc: RTCPeerConnection | null | undefined
): boolean {
  if (!pc) return false;
  return (
    pc.connectionState === "connected" &&
    (pc.iceConnectionState === "connected" ||
      pc.iceConnectionState === "completed")
  );
}

function buildPeerScopeSnapshot(
  pcs: Map<string, RTCPeerConnection>,
  getMedia: (remoteId: string) => { remoteTracksCount: number },
  highlightRemoteId?: string
): string {
  const parts: string[] = [];

  for (const [remoteId, pc] of pcs.entries()) {
    const media = getMedia(remoteId);
    const prefix = remoteId === highlightRemoteId ? "*" : "";
    parts.push(
      `${prefix}${compactDeviceId(remoteId)}:conn=${pc.connectionState}/` +
        `ice=${pc.iceConnectionState}/sig=${pc.signalingState}/tracks=${media.remoteTracksCount}`
    );
  }

  return parts.join("|") || "-";
}

export function usePeerConnections({
  sessionId,
  deviceId,
  members,
  membersSyncRevision = 0,
  isMuted,
  micReady,
  signalReady,
  localStreamRef,
  localAudioTrackRef,
  sendSignal,
  onRemoteCountChange,
  onStatusChange,
  onPeerStatesChange,
  onPeerDiagnosticsChange,
  onVoiceCleanup,
}: UsePeerConnectionsArgs) {
  const sessionIdRef = useRef(sessionId);
  const deviceIdRef = useRef(deviceId);
  const onVoiceCleanupRef = useRef(onVoiceCleanup);
  const emitPeerStatesRef = useRef<() => void>(() => {});

  sessionIdRef.current = sessionId;
  deviceIdRef.current = deviceId;
  onVoiceCleanupRef.current = onVoiceCleanup;

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const processedSignalIdsRef = useRef<Set<number>>(new Set());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const peerStatesRef = useRef<Map<string, PeerState>>(new Map());

  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const connectionIdsRef = useRef<Map<string, string>>(new Map());
  const offeredPeersRef = useRef<Set<string>>(new Set());
  const startedPeersRef = useRef<Set<string>>(new Set());

  const maybeStartOfferRef = useRef<
    ((remoteId: string, opts?: { force?: boolean; reason?: string }) => Promise<void>) | null
  >(null);
  const createPeerConnectionRef = useRef<
    ((remoteId: string, connectionId: string) => RTCPeerConnection) | null
  >(null);
  const ensurePeerConnectionRef = useRef<
    ((
      remoteId: string,
      reason: string,
      opts?: EnsurePeerConnectionOpts
    ) => boolean) | null
  >((remoteId, reason) => {
    console.log(
      `[voice-peer] ensurePeerConnection skipped remote=${compactDeviceId(remoteId)} ` +
        `requested=${reason} skip=ensure_not_initialized`
    );
    return false;
  });
  const scanAndEnsureMissingPcsRef = useRef<
    (trigger: string, peers: VoiceMeshPeerSummaryEntry[]) => void
  >((trigger, peers) => {
    const missing = peers.filter(
      (peer) => !peer.pcExists && peer.isInCall !== false
    );
    console.log(
      `[voice-peer] recoverMissingPcsFromMesh start trigger=${trigger} peers=${peers.length} missing=${missing.length} ` +
        `skip=scan_not_initialized`
    );
  });
  const scheduleReconnectRef = useRef<
    ((
      remoteId: string,
      delay: number | undefined,
      opts: ScheduleReconnectOpts
    ) => boolean) | null
  >(null);
  const setPeerStateRef = useRef<(remoteId: string, state: PeerState) => void>(
    () => {}
  );
  const attachRemoteTrackDiagnosticsRef = useRef<
    (remoteId: string, track: MediaStreamTrack) => void
  >(() => {});

  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);
  const voiceRouteRef = useRef<VoiceRoute>("stun");
  const turnIceServersRef = useRef<RTCIceServer[] | null>(null);
  const loadingTurnRef = useRef(false);

  const osRef = useRef<OsType>(detectOs());
  const connectStartedAtRef = useRef<Map<string, number>>(new Map());
  const loggedConnectedRef = useRef<Set<string>>(new Set());
  const healRunSeqRef = useRef(0);
  const peerHealActionRef = useRef<
    Map<string, { lastAction: string; consecutive: number }>
  >(new Map());
  const peerSnapshotRef = useRef<
    Map<
      string,
      {
        connectionState?: RTCPeerConnectionState;
        iceConnectionState?: RTCIceConnectionState;
        signalingState?: RTCSignalingState;
        iceGatheringState?: RTCIceGatheringState;
        remoteTracksCount?: number;
        hasRemoteStream?: boolean;
      }
    >
  >(new Map());
  const peerEverConnectedRef = useRef<Set<string>>(new Set());
  const peerLastConnectedAtRef = useRef<Map<string, number>>(new Map());
  const recoveryStartedAtRef = useRef<Map<string, number>>(new Map());
  const iceCheckingTimersRef = useRef<Map<string, number>>(new Map());
  const connectingTimersRef = useRef<Map<string, number>>(new Map());
  const attachedTrackIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const trackEndedAtRef = useRef<Map<string, number>>(new Map());
  const endedHoldTimersRef = useRef<Map<string, number>>(new Map());
  const passiveWaitOfferTimersRef = useRef<Map<string, number>>(new Map());
  const noStreamNoOfferTimersRef = useRef<Map<string, number>>(new Map());
  const reconnectPendingRef = useRef<
    Map<
      string,
      {
        reason: string;
        source: string;
        scheduledInMs: number;
        scheduledAt: number;
      }
    >
  >(new Map());
  const lastHealActionAtRef = useRef<Map<string, number>>(new Map());
  const lastHealRunCompletedAtRef = useRef(0);
  const peerSignalTimestampsRef = useRef<Map<string, PeerSignalTimestamps>>(
    new Map()
  );
  const peerMetaRef = useRef<Map<string, PeerMeta>>(new Map());
  const meshSummaryTimerRef = useRef<number | null>(null);
  const meshNotConnectedTimerRef = useRef<number | null>(null);

  const [remoteAudios, setRemoteAudios] = useState<
    Record<string, RemoteAudioState>
  >({});
  const remoteAudiosRef = useRef<Record<string, RemoteAudioState>>({});
  const missingRemoteAudioWarnedRef = useRef<Set<string>>(new Set());
  const ensureRemoteAudioMountedRef = useRef<
    (remoteId: string, reason: string) => boolean
  >(() => false);
  const triggerRemoteAudioReplayRef = useRef<
    (remoteId: string, reason: string) => void
  >(() => {});
  const audioReplayAtRef = useRef<Map<string, number>>(new Map());
  const audioUnconfirmedTimeoutNotifiedRef = useRef<Set<string>>(new Set());
  const peerIceDiagnosticsRef = useRef<Map<string, PeerIceDiagnostics>>(new Map());
  const iceRestartAttemptsRef = useRef<Map<string, number>>(new Map());
  const checkingPlaybackStuckAtRef = useRef<Map<string, number>>(new Map());
  const iceRestartPostTimersRef = useRef<Map<string, number>>(new Map());
  const turnFallbackAttemptedRef = useRef<Map<string, boolean>>(new Map());
  const p2pDirectFailedHoldUntilRef = useRef<Map<string, number>>(new Map());
  const manualHardResetHealPassRef = useRef<Set<string>>(new Set());
  const orphanRemoteAudioAtRef = useRef<Map<string, number>>(new Map());
  const orphanRemoteAudioRef = useRef<Set<string>>(new Set());
  const orphanRemoteAudioLoggedRef = useRef<Set<string>>(new Set());
  const [turnFallbackEnabled, setTurnFallbackEnabled] = useState(false);
  const turnFallbackEnabledRef = useRef(false);

  useEffect(() => {
    remoteAudiosRef.current = remoteAudios;
  }, [remoteAudios]);

  const notifyStatus = useCallback(
    (text: string) => {
      onStatusChange?.(text);
    },
    [onStatusChange]
  );

  const getPeerMedia = useCallback((remoteId: string) => {
    const remoteStream = remoteStreamsRef.current.get(remoteId);
    const snapshot = getRemoteStreamAudioSnapshot(remoteStream);
    return {
      hasRemoteStream: snapshot.hasLiveStream,
      remoteTracksCount: snapshot.liveTrackCount,
      remoteTracksTotal: snapshot.totalTrackCount,
      primaryTrackReadyState: snapshot.primaryTrack?.readyState ?? null,
    };
  }, []);

  const hasLiveRemoteAudioStream = useCallback((remoteId: string) => {
    const stream = remoteStreamsRef.current.get(remoteId);
    return getRemoteStreamAudioSnapshot(stream).hasLiveStream;
  }, []);

  const hasStaleEndedRemoteAudio = useCallback((remoteId: string) => {
    const stream = remoteStreamsRef.current.get(remoteId);
    const snapshot = getRemoteStreamAudioSnapshot(stream);
    return snapshot.totalTrackCount > 0 && !snapshot.hasLiveStream;
  }, []);

  const clearEndedRemoteAudio = useCallback(
    (remoteId: string, track?: MediaStreamTrack | null) => {
      const stream = remoteStreamsRef.current.get(remoteId);
      const endedTrack =
        track ?? stream?.getAudioTracks()[0] ?? null;

      if (!stream && !endedTrack) {
        return false;
      }

      remoteStreamsRef.current.delete(remoteId);

      setRemoteAudios((prev) => {
        if (!prev[remoteId]) return prev;
        const next = { ...prev };
        delete next[remoteId];
        return next;
      });

      console.log(
        `[voice-peer] remote-audio-clear-ended remote=${compactDeviceId(remoteId)} ` +
          `streamId=${compactStreamId(stream?.id ?? endedTrack?.id)} ` +
          `trackId=${compactStreamId(endedTrack?.id)} ${formatVoiceModeSuffix()}`
      );

      emitPeerStatesRef.current();
      return true;
    },
    []
  );

  const markPeerLastConnected = useCallback((remoteId: string) => {
    peerLastConnectedAtRef.current.set(remoteId, Date.now());
  }, []);

  const getTrackEndedHoldCheck = useCallback(
    (remoteId: string, pc: RTCPeerConnection | null | undefined) => {
      const media = getPeerMedia(remoteId);
      return evaluateTrackEndedHold({
        pc,
        media: {
          hasLiveRemoteAudioStream: media.hasRemoteStream,
          remoteTracksCount: media.remoteTracksCount,
        },
        lastConnectedAt: peerLastConnectedAtRef.current.get(remoteId),
      });
    },
    [getPeerMedia]
  );

  const clearNoStreamNoOfferTimer = useCallback((remoteId: string) => {
    const timer = noStreamNoOfferTimersRef.current.get(remoteId);
    if (timer) {
      window.clearTimeout(timer);
      noStreamNoOfferTimersRef.current.delete(remoteId);
    }
  }, []);

  const clearPassiveWaitOfferTimer = useCallback((remoteId: string) => {
    const timer = passiveWaitOfferTimersRef.current.get(remoteId);
    if (timer) {
      window.clearTimeout(timer);
      passiveWaitOfferTimersRef.current.delete(remoteId);
    }
  }, []);

  const clearPeerWatchdogTimers = useCallback((remoteId: string) => {
    clearPassiveWaitOfferTimer(remoteId);
    clearNoStreamNoOfferTimer(remoteId);

    const checkingTimer = iceCheckingTimersRef.current.get(remoteId);
    if (checkingTimer) {
      window.clearTimeout(checkingTimer);
      iceCheckingTimersRef.current.delete(remoteId);
    }

    const connectingTimer = connectingTimersRef.current.get(remoteId);
    if (connectingTimer) {
      window.clearTimeout(connectingTimer);
      connectingTimersRef.current.delete(remoteId);
    }

    const endedHoldTimer = endedHoldTimersRef.current.get(remoteId);
    if (endedHoldTimer) {
      window.clearTimeout(endedHoldTimer);
      endedHoldTimersRef.current.delete(remoteId);
    }
  }, [clearNoStreamNoOfferTimer, clearPassiveWaitOfferTimer]);

  const observePeerField = useCallback(
    (
      remoteId: string,
      field:
        | "connectionState"
        | "iceConnectionState"
        | "signalingState"
        | "iceGatheringState"
        | "remoteTracksCount"
        | "hasRemoteStream",
      next: string | number | boolean | null,
      pc?: RTCPeerConnection | null
    ) => {
      const prevSnapshot = peerSnapshotRef.current.get(remoteId) ?? {};
      const previous = (prevSnapshot as Record<string, unknown>)[field] ?? null;

      if (previous === next) return;

      peerSnapshotRef.current.set(remoteId, {
        ...prevSnapshot,
        [field]: next as never,
      });

      logPeerStateChange({
        sessionId,
        localDeviceId: deviceId,
        remoteDeviceId: remoteId,
        field,
        previous: previous as string | number | boolean | null,
        next,
        pc,
        media: getPeerMedia(remoteId),
      });
    },
    [deviceId, getPeerMedia, sessionId]
  );

  const syncPeerObservedStates = useCallback(
    (remoteId: string, pc: RTCPeerConnection) => {
      observePeerField(remoteId, "connectionState", pc.connectionState, pc);
      observePeerField(
        remoteId,
        "iceConnectionState",
        pc.iceConnectionState,
        pc
      );
      observePeerField(remoteId, "signalingState", pc.signalingState, pc);
      observePeerField(
        remoteId,
        "iceGatheringState",
        pc.iceGatheringState,
        pc
      );

      const media = getPeerMedia(remoteId);
      observePeerField(
        remoteId,
        "remoteTracksCount",
        media.remoteTracksCount,
        pc
      );
      observePeerField(remoteId, "hasRemoteStream", media.hasRemoteStream, pc);
    },
    [getPeerMedia, observePeerField]
  );

  const markRecoveryStart = useCallback((remoteId: string) => {
    if (!recoveryStartedAtRef.current.has(remoteId)) {
      recoveryStartedAtRef.current.set(remoteId, Date.now());
    }
  }, []);

  const getReconnectBlockReason = useCallback((remoteId: string) => {
    if (
      reconnectPendingRef.current.has(remoteId) ||
      reconnectTimersRef.current.has(remoteId)
    ) {
      return "reconnect_already_scheduled";
    }

    const lastActionAt = lastHealActionAtRef.current.get(remoteId);
    if (
      lastActionAt &&
      Date.now() - lastActionAt < voicePolicy.healPeerCooldownMs
    ) {
      return "heal_cooldown";
    }

    return null;
  }, []);

  const finalizeRecovery = useCallback(
    (
      remoteId: string,
      pc: RTCPeerConnection | null | undefined,
      recoveryVia: "connected" | "ontrack" | "unmute",
      elapsedMsSinceTrackEnded?: number
    ) => {
      const media = getPeerMedia(remoteId);
      if (media.remoteTracksCount <= 0 && recoveryVia !== "connected") {
        return;
      }

      const recoveryStartedAt = recoveryStartedAtRef.current.get(remoteId);
      const elapsedMs =
        recoveryStartedAt != null
          ? Date.now() - recoveryStartedAt
          : elapsedMsSinceTrackEnded ?? 0;

      if (elapsedMs <= 0 && elapsedMsSinceTrackEnded == null) {
        return;
      }

      trackEndedAtRef.current.delete(remoteId);
      recoveryStartedAtRef.current.delete(remoteId);
      reconnectPendingRef.current.delete(remoteId);

      const endedHoldTimer = endedHoldTimersRef.current.get(remoteId);
      if (endedHoldTimer) {
        window.clearTimeout(endedHoldTimer);
        endedHoldTimersRef.current.delete(remoteId);
      }

      const reconnectTimer = reconnectTimersRef.current.get(remoteId);
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimersRef.current.delete(remoteId);
      }

      logHealRecoverySuccess({
        sessionId,
        localDeviceId: deviceId,
        remoteDeviceId: remoteId,
        connectionState: pc?.connectionState ?? "connected",
        iceConnectionState: pc?.iceConnectionState ?? "connected",
        remoteTracksCount: media.remoteTracksCount,
        elapsedMs,
        recoveryVia,
        ...(elapsedMsSinceTrackEnded != null
          ? { elapsedMsSinceTrackEnded }
          : {}),
      });
    },
    [deviceId, getPeerMedia, sessionId]
  );

  const clearEndedHoldTimer = useCallback((remoteId: string) => {
    const timer = endedHoldTimersRef.current.get(remoteId);
    if (timer) {
      window.clearTimeout(timer);
      endedHoldTimersRef.current.delete(remoteId);
    }
  }, []);

  const cancelTrackEndedHold = useCallback(
    (remoteId: string, reason: "ontrack" | "unmute") => {
      const hadHold = endedHoldTimersRef.current.has(remoteId);
      clearEndedHoldTimer(remoteId);

      if (!hadHold && !trackEndedAtRef.current.has(remoteId)) {
        return;
      }

      console.log(
        `[voice-peer] track-ended-hold-cancel remote=${compactDeviceId(remoteId)} reason=${reason} ${formatVoiceModeSuffix()}`
      );

      const pc = pcsRef.current.get(remoteId) ?? null;
      if (
        isPeerTransportHealthy(pc) ||
        peerEverConnectedRef.current.has(remoteId) ||
        getTrackEndedHoldCheck(remoteId, pc).shouldHold
      ) {
        setPeerStateRef.current(remoteId, "connected");
      }

      const endedAt = trackEndedAtRef.current.get(remoteId);
      if (endedAt != null) {
        finalizeRecovery(
          remoteId,
          pc,
          reason,
          Date.now() - endedAt
        );
      }
    },
    [clearEndedHoldTimer, finalizeRecovery, getTrackEndedHoldCheck]
  );

  const scheduleTrackEndedHold = useCallback(
    (remoteId: string, pcBefore: RTCPeerConnection | null | undefined) => {
      clearEndedHoldTimer(remoteId);

      const pc = pcBefore ?? pcsRef.current.get(remoteId) ?? null;
      console.log(
        `[voice-peer] track-ended-hold remote=${compactDeviceId(remoteId)} delayMs=${TRACK_ENDED_HOLD_MS} ` +
          `conn=${pc?.connectionState ?? "-"} ice=${pc?.iceConnectionState ?? "-"} ` +
          `sig=${pc?.signalingState ?? "-"} ${formatVoiceModeSuffix()}`
      );

      if (
        peerEverConnectedRef.current.has(remoteId) ||
        getTrackEndedHoldCheck(remoteId, pc).shouldHold
      ) {
        setPeerStateRef.current(remoteId, "connected");
      }

      const timer = window.setTimeout(() => {
        endedHoldTimersRef.current.delete(remoteId);

        if (hasLiveRemoteAudioStream(remoteId)) {
          trackEndedAtRef.current.delete(remoteId);
          recoveryStartedAtRef.current.delete(remoteId);
          setPeerStateRef.current(remoteId, "connected");
          return;
        }

        console.log(
          `[voice-peer] track-ended-hold-expired remote=${compactDeviceId(remoteId)} action=reconnect ${formatVoiceModeSuffix()}`
        );

        const reconnectScheduled = Boolean(
          scheduleReconnectRef.current?.(
            remoteId,
            voicePolicy.trackEndedReconnectMs,
            {
              reason: "remote_track_ended_hold_expired",
              source: "track_ended_hold_timer",
              force: voicePolicy.trackEndedForceReconnect,
            }
          )
        );

        if (
          !reconnectScheduled &&
          voicePolicy.trackEndedImmediateEnsure
        ) {
          ensurePeerConnectionRef.current?.(
            remoteId,
            "track_ended_hold_expired",
            { force: true }
          );
        }
      }, TRACK_ENDED_HOLD_MS);

      endedHoldTimersRef.current.set(remoteId, timer);
    },
    [clearEndedHoldTimer, getTrackEndedHoldCheck, hasLiveRemoteAudioStream]
  );

  const maybeLogRecoverySuccess = useCallback(
    (remoteId: string, pc: RTCPeerConnection) => {
      const hasRecoveryContext =
        peerEverConnectedRef.current.has(remoteId) ||
        trackEndedAtRef.current.has(remoteId) ||
        recoveryStartedAtRef.current.has(remoteId);

      if (!hasRecoveryContext) return;

      const trackEndedAt = trackEndedAtRef.current.get(remoteId);
      finalizeRecovery(
        remoteId,
        pc,
        "connected",
        trackEndedAt != null ? Date.now() - trackEndedAt : undefined
      );
    },
    [finalizeRecovery]
  );

  const activeMembers = useMemo(() => {
    return members;
  }, [members]);

  const getRemoteIds = useCallback(() => {
    const selfId = String(deviceId ?? "").trim();
    return activeMembers
      .map((m) => String(m.device_id ?? "").trim())
      .filter((id) => id && id !== selfId);
  }, [activeMembers, deviceId]);

  const touchPeerSignal = useCallback(
    (
      remoteId: string,
      event:
        | "offer_sent"
        | "offer_received"
        | "answer_sent"
        | "answer_received"
        | "ice_sent"
        | "ice_received"
        | "ontrack"
        | "unmute"
        | "play_success"
        | "playback_active"
        | "playback_confirmed"
    ) => {
      const prev =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      const now = Date.now();

      const next: PeerSignalTimestamps = { ...prev };

      if (event === "offer_sent" || event === "offer_received") {
        next.lastOfferAt = now;
      }
      if (event === "answer_sent" || event === "answer_received") {
        next.lastAnswerAt = now;
      }
      if (event === "ice_sent" || event === "ice_received") {
        next.lastIceCandidateAt = now;
      }
      if (event === "ontrack") {
        next.lastOnTrackAt = now;
      }
      if (event === "unmute") {
        next.lastUnmuteAt = now;
      }
      if (event === "play_success") {
        next.lastPlaySuccessAt = now;
      }
      if (event === "playback_active") {
        next.lastPlaybackActiveAt = now;
      }
      if (event === "playback_confirmed") {
        next.lastPlaybackConfirmedAt = now;
        next.lastPlaybackActiveAt = now;
        audioUnconfirmedTimeoutNotifiedRef.current.delete(remoteId);
      }

      peerSignalTimestampsRef.current.set(remoteId, next);
    },
    []
  );

  const handleRemotePlaybackHealthChange = useCallback(
    (remoteId: string, health: RemotePlaybackHealth) => {
      if (health.playSuccessEvent) {
        touchPeerSignal(remoteId, "play_success");
      }
      if (health.playbackActiveMode === "confirmed") {
        touchPeerSignal(remoteId, "playback_confirmed");
      } else if (health.playbackActive) {
        touchPeerSignal(remoteId, "playback_active");
      }
      if (health.playbackActive) {
        console.log(
          `[voice-peer] playback-active remote=${compactDeviceId(remoteId)} ageMs=0 source=remote_audio ` +
            `mode=${health.playbackActiveMode} ${formatVoiceModeSuffix()}`
        );
      }
    },
    [touchPeerSignal]
  );

  const handlePlaybackUnconfirmedTimeout = useCallback((remoteId: string) => {
    if (audioUnconfirmedTimeoutNotifiedRef.current.has(remoteId)) return;

    const timestamps =
      peerSignalTimestampsRef.current.get(remoteId) ??
      emptyPeerSignalTimestamps();
    if (timestamps.lastPlaybackConfirmedAt != null) return;

    audioUnconfirmedTimeoutNotifiedRef.current.add(remoteId);

    const playAt =
      timestamps.lastPlaySuccessAt != null
        ? `${Math.max(0, Math.round((Date.now() - timestamps.lastPlaySuccessAt) / 1000))}s`
        : "-";
    const playbackAt =
      timestamps.lastPlaybackActiveAt != null
        ? `${Math.max(0, Math.round((Date.now() - timestamps.lastPlaybackActiveAt) / 1000))}s`
        : "-";

    console.log(
      `[voice-peer] audio-unconfirmed-timeout remote=${compactDeviceId(remoteId)} ` +
        `confirmedAt=- playAt=${playAt} playbackAt=${playbackAt} attempts=3 ${formatVoiceModeSuffix()}`
    );

    void attemptSignalingRecoverRef
      .current(remoteId, "audio_playback_unconfirmed_timeout")
      .finally(() => {
        if (!reconnectPendingRef.current.has(remoteId)) {
          scheduleReconnectRef.current?.(remoteId, 1200, {
            reason: "audio_playback_unconfirmed_timeout",
            source: "audio_playback_unconfirmed_timeout",
            force: true,
          });
        }
      });
  }, []);

  const setPeerMeta = useCallback(
    (
      remoteId: string,
      patch: Partial<Pick<PeerMeta, "lastWarning" | "lastHealAction">>
    ) => {
      const prev = peerMetaRef.current.get(remoteId) ?? {
        lastWarning: null,
        lastHealAction: null,
      };
      peerMetaRef.current.set(remoteId, { ...prev, ...patch });
    },
    []
  );

  const buildMeshPeerSummary = useCallback(
    (remoteId: string): VoiceMeshPeerSummaryEntry => {
      const member = members.find((m) => m.device_id === remoteId);
      const pc = pcsRef.current.get(remoteId) ?? null;
      const media = getPeerMedia(remoteId);
      const stream = remoteStreamsRef.current.get(remoteId);
      const audioTrack = stream?.getAudioTracks()[0] ?? null;
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      const meta = peerMetaRef.current.get(remoteId) ?? {
        lastWarning: null,
        lastHealAction: null,
      };
      const connectStartedAt = connectStartedAtRef.current.get(remoteId) ?? null;
      const msSinceConnectStart =
        connectStartedAt != null ? Date.now() - connectStartedAt : null;
      const hasLocalTrack = pc
        ? pc
            .getSenders()
            .some((sender) => sender.track?.kind === "audio" && !!sender.track)
        : false;

      return {
        remoteDeviceId: remoteId,
        memberExists: !!member,
        isInCall: member ? member.is_in_call !== false : null,
        isOfferOwner: deviceId < remoteId,
        pcExists: isUsablePeerConnection(pc),
        signalingState: pc?.signalingState ?? null,
        connectionState: pc?.connectionState ?? null,
        iceConnectionState: pc?.iceConnectionState ?? null,
        iceGatheringState: pc?.iceGatheringState ?? null,
        hasLocalTrack,
        hasRemoteStream: media.hasRemoteStream,
        remoteTracksCount: media.remoteTracksCount,
        remoteAudioTrackReadyState: audioTrack?.readyState ?? null,
        remoteAudioTrackMuted: audioTrack?.muted ?? null,
        weOffered: offeredPeersRef.current.has(remoteId),
        reconnectPending:
          reconnectPendingRef.current.has(remoteId) ||
          reconnectTimersRef.current.has(remoteId),
        reconnectBlockReason: getReconnectBlockReason(remoteId),
        pendingIceCount: pendingIceRef.current.get(remoteId)?.length ?? 0,
        connectStartedAt,
        msSinceConnectStart,
        lastOfferAt: timestamps.lastOfferAt,
        lastAnswerAt: timestamps.lastAnswerAt,
        lastIceCandidateAt: timestamps.lastIceCandidateAt,
        lastOnTrackAt: timestamps.lastOnTrackAt,
        lastUnmuteAt: timestamps.lastUnmuteAt,
        lastPlaySuccessAt: timestamps.lastPlaySuccessAt,
        lastPlaybackActiveAt: timestamps.lastPlaybackActiveAt,
        lastPlaybackConfirmedAt: timestamps.lastPlaybackConfirmedAt,
        lastWarning: meta.lastWarning,
        lastHealAction: meta.lastHealAction,
      };
    },
    [deviceId, getPeerMedia, getReconnectBlockReason, members]
  );

  const isRemoteInCall = useCallback(
    (remoteId: string) => {
      const member = members.find((m) => m.device_id === remoteId);
      if (!member) return true;
      return member.is_in_call !== false;
    },
    [members]
  );

  const peerNeedsPc = useCallback((remoteId: string) => {
    return !isUsablePeerConnection(pcsRef.current.get(remoteId));
  }, []);

  const logEnsureSkipped = useCallback(
    (
      remoteId: string,
      requestedReason: string,
      skipReason: string,
      extra?: string
    ) => {
      console.log(
        `[voice-peer] ensurePeerConnection skipped remote=${compactDeviceId(remoteId)} ` +
          `requested=${requestedReason} skip=${skipReason}${extra ? ` ${extra}` : ""}`
      );
    },
    []
  );

  const emitMeshSummary = useCallback(
    (trigger: string, opts?: { immediate?: boolean }) => {
      const run = () => {
        const memberDeviceIds = members
          .map((m) => String(m.device_id ?? "").trim())
          .filter(Boolean);
        const inCallMemberDeviceIds = members
          .filter((m) => m.is_in_call === true)
          .map((m) => String(m.device_id ?? "").trim())
          .filter(Boolean);
        const remoteIds = getRemoteIds();
        const peerIds = Array.from(
          new Set([...remoteIds, ...Array.from(pcsRef.current.keys())])
        );

        const peers = peerIds.map((remoteId) => buildMeshPeerSummary(remoteId));
        const summary = {
          trigger,
          sessionId,
          localDeviceId: deviceId,
          memberDeviceIds,
          inCallMemberDeviceIds,
          peers,
        };

        logVoiceMeshPeerSummary(summary, (loggedPeers) => {
          scanAndEnsureMissingPcsRef.current(trigger, loggedPeers);
        });
        try {
          checkVoiceMeshExpectations(summary);
        } catch (err) {
          console.log(
            `[voice-peer] checkVoiceMeshExpectations error trigger=${trigger} err=${String(err)}`
          );
        }
      };

      if (opts?.immediate) {
        if (meshSummaryTimerRef.current) {
          window.clearTimeout(meshSummaryTimerRef.current);
          meshSummaryTimerRef.current = null;
        }
        run();
        return;
      }

      if (meshSummaryTimerRef.current) {
        window.clearTimeout(meshSummaryTimerRef.current);
      }

      meshSummaryTimerRef.current = window.setTimeout(() => {
        meshSummaryTimerRef.current = null;
        run();
      }, MESH_SUMMARY_DEBOUNCE_MS);
    },
    [buildMeshPeerSummary, deviceId, getRemoteIds, members, sessionId]
  );

  const emitPeerStates = useCallback(() => {
    onPeerStatesChange?.(Object.fromEntries(peerStatesRef.current.entries()));
    if (!onPeerDiagnosticsChange) return;

    const peerIds = Array.from(
      new Set([
        ...getRemoteIds(),
        ...Array.from(pcsRef.current.keys()),
        ...members.map((m) => String(m.device_id ?? "").trim()).filter(Boolean),
      ])
    );

    const diagnostics: Record<string, PeerStatusDiagnostics> = {};
    for (const remoteId of peerIds) {
      if (!remoteId || remoteId === deviceId) continue;

      const pc = pcsRef.current.get(remoteId) ?? null;
      const media = getPeerMedia(remoteId);
      const stream = remoteStreamsRef.current.get(remoteId);
      const audioTrack = stream?.getAudioTracks()[0] ?? null;
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();

      if (media.remoteTracksCount > 0 || media.hasRemoteStream) {
        ensureRemoteAudioMountedRef.current(remoteId, "emit_peer_states");
      }

      const holdUntil = p2pDirectFailedHoldUntilRef.current.get(remoteId);
      let p2pDirectFailedHoldRemainingMs: number | null = null;
      if (holdUntil != null) {
        const remaining = holdUntil - Date.now();
        if (remaining > 0) {
          p2pDirectFailedHoldRemainingMs = remaining;
        } else {
          p2pDirectFailedHoldUntilRef.current.delete(remoteId);
        }
      }

      diagnostics[remoteId] = {
        hasPc: isUsablePeerConnection(pc),
        conn: pc?.connectionState ?? "-",
        ice: pc?.iceConnectionState ?? "-",
        sig: pc?.signalingState ?? "-",
        hasRemoteStream: media.hasRemoteStream,
        remoteTracksCount: media.remoteTracksCount,
        trackReady: audioTrack?.readyState ?? media.primaryTrackReadyState ?? "-",
        isRemoteInCall: isRemoteInCall(remoteId),
        lastPlaybackActiveAt: timestamps.lastPlaybackActiveAt,
        lastPlaybackConfirmedAt: timestamps.lastPlaybackConfirmedAt,
        remoteAudioMounted: !!remoteAudiosRef.current[remoteId],
        orphanRemoteAudio: orphanRemoteAudioRef.current.has(remoteId),
        p2pDirectFailedHoldActive: p2pDirectFailedHoldRemainingMs != null,
        p2pDirectFailedHoldRemainingMs,
      };
    }

    onPeerDiagnosticsChange(diagnostics);
  }, [
    deviceId,
    getPeerMedia,
    getRemoteIds,
    isRemoteInCall,
    members,
    onPeerDiagnosticsChange,
    onPeerStatesChange,
  ]);

  useEffect(() => {
    emitPeerStatesRef.current = emitPeerStates;
  }, [emitPeerStates]);

  const setPeerState = useCallback(
    (remoteId: string, state: PeerState) => {
      peerStatesRef.current.set(remoteId, state);
      emitPeerStates();
    },
    [emitPeerStates]
  );

  useEffect(() => {
    setPeerStateRef.current = setPeerState;
  }, [setPeerState]);

  const clearReconnectTimer = useCallback((remoteId: string) => {
    const timer = reconnectTimersRef.current.get(remoteId);
    if (timer) {
      window.clearTimeout(timer);
      reconnectTimersRef.current.delete(remoteId);
    }
  }, []);

  const getCurrentConnectionId = useCallback((remoteId: string) => {
    return connectionIdsRef.current.get(remoteId) ?? null;
  }, []);

  const setCurrentConnectionId = useCallback(
    (remoteId: string, connectionId: string) => {
      connectionIdsRef.current.set(remoteId, connectionId);
    },
    []
  );

  const assignConnectionId = useCallback(
    (remoteId: string, connectionId: string, reason: string) => {
      const old = getCurrentConnectionId(remoteId);
      if (old === connectionId) return;
      setCurrentConnectionId(remoteId, connectionId);
      console.log(
        `[voice-peer] connection-id remote=${compactDeviceId(remoteId)} ` +
          `old=${compactConnectionId(old)} new=${compactConnectionId(connectionId)} reason=${reason}`
      );
    },
    [getCurrentConnectionId, setCurrentConnectionId]
  );

  const clearCurrentConnectionId = useCallback(
    (remoteId: string, reason = "unspecified") => {
      const old = getCurrentConnectionId(remoteId);
      if (old == null) return;
      connectionIdsRef.current.delete(remoteId);
      console.log(
        `[voice-peer] connection-id remote=${compactDeviceId(remoteId)} ` +
          `old=${compactConnectionId(old)} new=- reason=${reason}`
      );
    },
    [getCurrentConnectionId]
  );

  const getP2pDirectFailedHoldRemainingMs = useCallback((remoteId: string) => {
    const holdUntil = p2pDirectFailedHoldUntilRef.current.get(remoteId);
    if (holdUntil == null) return null;
    const remaining = holdUntil - Date.now();
    if (remaining <= 0) {
      p2pDirectFailedHoldUntilRef.current.delete(remoteId);
      return null;
    }
    return remaining;
  }, []);

  const logHealSkipP2pTurnDisabledHold = useCallback(
    (remoteId: string): boolean => {
      if (manualHardResetHealPassRef.current.delete(remoteId)) {
        return false;
      }

      const holdRemainingMs = getP2pDirectFailedHoldRemainingMs(remoteId);
      if (holdRemainingMs == null) return false;
      console.log(
        `[voice-peer] heal-skip remote=${compactDeviceId(remoteId)} reason=p2p_direct_failed_turn_disabled_hold ` +
          `holdRemainingMs=${holdRemainingMs} ${formatVoiceModeSuffix()}`
      );
      return true;
    },
    [getP2pDirectFailedHoldRemainingMs]
  );

  const shouldHoldCloseForReconnectClearEnded = useCallback(
    (remoteId: string) => {
      if (hasLiveRemoteAudioStream(remoteId)) return true;

      const media = getPeerMedia(remoteId);
      const stream = remoteStreamsRef.current.get(remoteId);
      if (media.remoteTracksCount > 0 && stream) {
        if (getRemoteStreamAudioSnapshot(stream).hasLiveStream) return true;
      }

      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      if (timestamps.lastPlaybackConfirmedAt != null) return false;

      const playAgeMs = signalAgeMs(timestamps.lastPlaySuccessAt);
      const playbackAgeMs = signalAgeMs(timestamps.lastPlaybackActiveAt);
      if (playAgeMs != null && playAgeMs < PLAYBACK_ACTIVE_HOLD_MS * 2) {
        return true;
      }
      if (
        playbackAgeMs != null &&
        playbackAgeMs < PLAYBACK_ACTIVE_HOLD_MS
      ) {
        return true;
      }

      return false;
    },
    [getPeerMedia, hasLiveRemoteAudioStream]
  );

  const markConnectStart = useCallback((remoteId: string) => {
    if (!connectStartedAtRef.current.has(remoteId)) {
      connectStartedAtRef.current.set(remoteId, Date.now());
    }
  }, []);

  const logVoiceConnection = useCallback(
    async (
      remoteId: string,
      pc: RTCPeerConnection,
      phase: "connected" | "failed" = "connected"
    ) => {
      const connectionId = getCurrentConnectionId(remoteId);
      const logKey = `${remoteId}:${connectionId ?? "none"}:${phase}`;

      if (phase === "connected" && loggedConnectedRef.current.has(logKey)) {
        return;
      }

      try {
        const result =
          phase === "connected"
            ? await detectConnectionType(pc)
            : { route: "unknown", localType: null, remoteType: null };

        const startedAt = connectStartedAtRef.current.get(remoteId);
        const timeToConnectMs = startedAt ? Date.now() - startedAt : null;

        await fetch("/api/voice-connection-log", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            deviceId,
            remoteDeviceId: remoteId,
            phase,
            route: result.route,
            localCandidateType: result.localType,
            remoteCandidateType: result.remoteType,
            voiceRoute: voiceRouteRef.current,
            connectionState:
              phase === "connected" ? pc.connectionState : "failed",
            timeToConnectMs,
            os: osRef.current,
            memberCount: members.length,
          }),
        });

        if (phase === "connected") {
          loggedConnectedRef.current.add(logKey);
        }
      } catch (e) {
        console.warn("[call] voice log failed", e);
      }
    },
    [deviceId, getCurrentConnectionId, members.length, sessionId]
  );

  const upsertRemoteAudio = useCallback(
    (
      remoteId: string,
      stream: MediaStream,
      opts?: { reason?: string; force?: boolean }
    ) => {
      const audioTrack = stream.getAudioTracks()[0] ?? null;
      if (!audioTrack || audioTrack.readyState !== "live") {
        console.log(
          `[voice-peer] upsertRemoteAudio skipped remote=${compactDeviceId(remoteId)} ` +
            `reason=${opts?.reason ?? "ontrack"} trackReady=${audioTrack?.readyState ?? "none"} ${formatVoiceModeSuffix()}`
        );
        return;
      }

      remoteStreamsRef.current.set(remoteId, stream);

      for (const track of stream.getAudioTracks()) {
        attachRemoteTrackDiagnosticsRef.current(remoteId, track);
      }

      setRemoteAudios((prev) => {
        const prevState = prev[remoteId];
        const member = members.find((m) => m.device_id === remoteId);
        const prevTrackId = prevState?.stream.getAudioTracks()[0]?.id ?? null;
        const nextTrackId = stream.getAudioTracks()[0]?.id ?? null;

        if (
          !opts?.force &&
          prevState?.stream === stream &&
          prevTrackId === nextTrackId
        ) {
          return {
            ...prev,
            [remoteId]: {
              ...prevState,
              member,
            },
          };
        }

        voiceDebugLog("[voice-peer] upsertRemoteAudio", {
          remoteId,
          reason: opts?.reason ?? "ontrack",
          trackId: nextTrackId,
          trackReadyState: stream.getAudioTracks()[0]?.readyState ?? null,
          attachSeq: Date.now(),
        });

        return {
          ...prev,
          [remoteId]: {
            stream,
            member,
            attachSeq: Date.now(),
            replayReason: null,
          },
        };
      });

      touchPeerSignal(remoteId, "ontrack");
      emitMeshSummary("ontrack", { immediate: true });

      const pc = pcsRef.current.get(remoteId);
      if (pc) {
        syncPeerObservedStates(remoteId, pc);
      }
    },
    [members, syncPeerObservedStates, touchPeerSignal, emitMeshSummary]
  );

  const syncRemoteAudioFromPc = useCallback(
    (remoteId: string, pc: RTCPeerConnection, reason: string) => {
      const liveTrack = pc
        .getReceivers()
        .map((receiver) => receiver.track)
        .find(
          (track): track is MediaStreamTrack =>
            !!track &&
            track.kind === "audio" &&
            track.readyState === "live"
        );

      if (!liveTrack) {
        voiceDebugLog("[voice-peer] syncRemoteAudio skip", {
          remoteId,
          reason,
          receiverCount: pc.getReceivers().length,
        });
        return false;
      }

      const prevStream = remoteStreamsRef.current.get(remoteId);
      const prevTrack = prevStream?.getAudioTracks()[0];
      if (
        prevTrack?.id === liveTrack.id &&
        prevTrack.readyState === "live" &&
        !prevTrack.muted
      ) {
        return false;
      }

      upsertRemoteAudio(remoteId, new MediaStream([liveTrack]), {
        reason: `sync:${reason}`,
        force: true,
      });
      return true;
    },
    [upsertRemoteAudio]
  );

  const ensureRemoteAudioMounted = useCallback(
    (remoteId: string, reason: string) => {
      if (remoteAudiosRef.current[remoteId]) return true;

      const pc = pcsRef.current.get(remoteId);
      const stream = remoteStreamsRef.current.get(remoteId);
      const snapshot = getRemoteStreamAudioSnapshot(stream);

      if (stream && snapshot.hasLiveStream) {
        upsertRemoteAudio(remoteId, stream, { force: true, reason });
        return true;
      }

      if (pc) {
        const synced = syncRemoteAudioFromPc(remoteId, pc, reason);
        if (synced) return true;

        const liveTrack = pc
          .getReceivers()
          .map((receiver) => receiver.track)
          .find(
            (track): track is MediaStreamTrack =>
              !!track && track.kind === "audio" && track.readyState === "live"
          );

        if (liveTrack) {
          upsertRemoteAudio(remoteId, new MediaStream([liveTrack]), {
            force: true,
            reason,
          });
          return true;
        }
      }

      return false;
    },
    [syncRemoteAudioFromPc, upsertRemoteAudio]
  );

  const triggerRemoteAudioReplay = useCallback(
    (remoteId: string, reason: string) => {
      console.log(
        `[remote-audio] replay remote=${compactDeviceId(remoteId)} reason=${reason} ${formatVoiceModeSuffix()}`
      );

      ensureRemoteAudioMounted(remoteId, `replay:${reason}`);

      const member = members.find((m) => m.device_id === remoteId);
      setRemoteAudios((prev) => {
        const existing = prev[remoteId];
        const stream =
          existing?.stream ?? remoteStreamsRef.current.get(remoteId) ?? null;
        if (!stream) return prev;

        return {
          ...prev,
          [remoteId]: {
            stream,
            member,
            attachSeq: Date.now(),
            replayReason: reason,
          },
        };
      });
    },
    [ensureRemoteAudioMounted, members]
  );

  useEffect(() => {
    ensureRemoteAudioMountedRef.current = ensureRemoteAudioMounted;
    triggerRemoteAudioReplayRef.current = triggerRemoteAudioReplay;
  }, [ensureRemoteAudioMounted, triggerRemoteAudioReplay]);

  useEffect(() => {
    if (!micReady || !signalReady) return;

    const timer = window.setInterval(() => {
      const remoteIds = getRemoteIds();

      for (const remoteId of remoteIds) {
        const media = getPeerMedia(remoteId);
        if (media.remoteTracksCount === 0 && !media.hasRemoteStream) continue;

        const timestamps =
          peerSignalTimestampsRef.current.get(remoteId) ??
          emptyPeerSignalTimestamps();
        const ontrackAgeMs = timestamps.lastOnTrackAt
          ? Date.now() - timestamps.lastOnTrackAt
          : null;
        const neverPlayed = timestamps.lastPlaySuccessAt == null;

        if (!remoteAudiosRef.current[remoteId]) {
          if (!missingRemoteAudioWarnedRef.current.has(remoteId)) {
            missingRemoteAudioWarnedRef.current.add(remoteId);
            console.warn(
              `[call-audio] missing-remote-audio remote=${compactDeviceId(remoteId)} reason=stream_exists_but_audio_component_missing ${formatVoiceModeSuffix()}`
            );
          }
          ensureRemoteAudioMountedRef.current(remoteId, "audio_watchdog_mount");
        } else {
          missingRemoteAudioWarnedRef.current.delete(remoteId);
        }

        if (ontrackAgeMs != null && ontrackAgeMs >= 5000 && neverPlayed) {
          const lastReplay = audioReplayAtRef.current.get(remoteId) ?? 0;
          if (Date.now() - lastReplay >= 5000) {
            audioReplayAtRef.current.set(remoteId, Date.now());
            if (remoteAudiosRef.current[remoteId]) {
              triggerRemoteAudioReplayRef.current(
                remoteId,
                "stream_present_but_never_played"
              );
            } else {
              ensureRemoteAudioMountedRef.current(
                remoteId,
                "stream_present_but_never_played_mount"
              );
            }
          }
        }

        const playSuccessAt = timestamps.lastPlaySuccessAt;
        const confirmedAt = timestamps.lastPlaybackConfirmedAt;
        if (playSuccessAt && !confirmedAt) {
          const pc = pcsRef.current.get(remoteId);
          if (pc) {
            const conn = pc.connectionState;
            const ice = pc.iceConnectionState;
            const stalled =
              conn === "connecting" ||
              ice === "checking" ||
              ice === "new";
            const pendingIceCount =
              pendingIceRef.current.get(remoteId)?.length ?? 0;
            if (stalled && (pendingIceCount > 0 || getCurrentConnectionId(remoteId))) {
              void attemptSignalingRecoverRef.current(
                remoteId,
                "watchdog_unconfirmed_playback"
              );
            }

            const stuckAt = checkingPlaybackStuckAtRef.current.get(remoteId);
            const stuckAgeMs = stuckAt ? Date.now() - stuckAt : null;
            if (
              stalled &&
              media.remoteTracksCount > 0 &&
              stuckAgeMs != null &&
              stuckAgeMs >= ICE_RESTART_STUCK_MS &&
              (iceRestartAttemptsRef.current.get(remoteId) ?? 0) <
                MAX_ICE_RESTART_ATTEMPTS
            ) {
              void attemptIceRestartRef.current(remoteId);
            }
          }
        }

        const hasPc = isUsablePeerConnection(pcsRef.current.get(remoteId));
        const pcState = pcsRef.current.get(remoteId)?.connectionState ?? "-";
        const unconfirmed = timestamps.lastPlaybackConfirmedAt == null;
        const hasPlaybackSignal =
          timestamps.lastPlaySuccessAt != null ||
          timestamps.lastPlaybackActiveAt != null;

        if (
          !hasPc &&
          media.hasRemoteStream &&
          media.remoteTracksCount > 0 &&
          unconfirmed &&
          hasPlaybackSignal
        ) {
          const orphanSince = orphanRemoteAudioAtRef.current.get(remoteId);
          if (orphanSince == null) {
            orphanRemoteAudioAtRef.current.set(remoteId, Date.now());
          } else if (Date.now() - orphanSince >= ORPHAN_REMOTE_AUDIO_MS) {
            orphanRemoteAudioRef.current.add(remoteId);
            if (!orphanRemoteAudioLoggedRef.current.has(remoteId)) {
              orphanRemoteAudioLoggedRef.current.add(remoteId);
              console.log(
                `[remote-audio] orphan-detected remote=${compactDeviceId(remoteId)} ` +
                  `reason=pc_missing_or_failed pcState=${pcState} tracks=${media.remoteTracksCount} ` +
                  `hasStream=${media.hasRemoteStream} ${formatVoiceModeSuffix()}`
              );
              emitPeerStatesRef.current();
            }
          }
        } else if (hasPc) {
          orphanRemoteAudioAtRef.current.delete(remoteId);
          if (orphanRemoteAudioRef.current.delete(remoteId)) {
            emitPeerStatesRef.current();
          }
          orphanRemoteAudioLoggedRef.current.delete(remoteId);
        }
      }
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [getCurrentConnectionId, getPeerMedia, getRemoteIds, micReady, signalReady]);

  useEffect(() => {
    setRemoteAudios((prev) => {
      const next: Record<string, RemoteAudioState> = {};

      for (const [remoteId, state] of Object.entries(prev)) {
        const member = members.find((m) => m.device_id === remoteId);
        next[remoteId] = { ...state, member };
      }

      return next;
    });
  }, [members]);

  useEffect(() => {
    onRemoteCountChange?.(Object.keys(remoteAudios).length);
  }, [remoteAudios, onRemoteCountChange]);

  const closePeer = useCallback(
    (
      remoteId: string,
      opts?: {
        clearConnectionId?: boolean;
        preserveRemoteAudio?: boolean;
        reason?: string;
      }
    ) => {
      const shouldClearConnectionId = opts?.clearConnectionId ?? false;
      const reason = opts?.reason ?? "unspecified";

      if (
        reason === "reconnect_clear_ended_audio" &&
        shouldHoldCloseForReconnectClearEnded(remoteId)
      ) {
        console.log(
          `[voice-peer] close-hold remote=${compactDeviceId(remoteId)} ` +
            `reason=live_or_playback_stream_exists originalReason=${reason} ${formatVoiceModeSuffix()}`
        );
        if (hasStaleEndedRemoteAudio(remoteId)) {
          clearEndedRemoteAudio(remoteId);
        }
        return;
      }

      const preserveRemoteAudio =
        opts?.preserveRemoteAudio === true && hasLiveRemoteAudioStream(remoteId);
      const pc = pcsRef.current.get(remoteId);
      const hadPc = !!pc;
      const prevPeerState = peerStatesRef.current.get(remoteId);

      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.oniceconnectionstatechange = null;
          pc.onsignalingstatechange = null;
          pc.onicegatheringstatechange = null;
          pc.close();
        } catch {}
      }

      pcsRef.current.delete(remoteId);
      offeredPeersRef.current.delete(remoteId);
      startedPeersRef.current.delete(remoteId);
      if (!preserveRemoteAudio) {
        remoteStreamsRef.current.delete(remoteId);
      }
      pendingIceRef.current.delete(remoteId);
      clearReconnectTimer(remoteId);
      clearPeerWatchdogTimers(remoteId);

      connectStartedAtRef.current.delete(remoteId);
      peerSnapshotRef.current.delete(remoteId);
      attachedTrackIdsRef.current.delete(remoteId);
      trackEndedAtRef.current.delete(remoteId);
      peerLastConnectedAtRef.current.delete(remoteId);
      reconnectPendingRef.current.delete(remoteId);
      lastHealActionAtRef.current.delete(remoteId);
      peerSignalTimestampsRef.current.delete(remoteId);
      peerMetaRef.current.delete(remoteId);
      peerIceDiagnosticsRef.current.delete(remoteId);
      checkingPlaybackStuckAtRef.current.delete(remoteId);
      const iceRestartPostTimer = iceRestartPostTimersRef.current.get(remoteId);
      if (iceRestartPostTimer) {
        window.clearTimeout(iceRestartPostTimer);
        iceRestartPostTimersRef.current.delete(remoteId);
      }
      iceRestartAttemptsRef.current.delete(remoteId);
      turnFallbackAttemptedRef.current.delete(remoteId);
      p2pDirectFailedHoldUntilRef.current.delete(remoteId);
      orphanRemoteAudioAtRef.current.delete(remoteId);
      orphanRemoteAudioRef.current.delete(remoteId);
      orphanRemoteAudioLoggedRef.current.delete(remoteId);

      if (preserveRemoteAudio && prevPeerState === "connected") {
        peerStatesRef.current.set(remoteId, "connected");
      } else {
        peerStatesRef.current.delete(remoteId);
      }
      emitPeerStates();

      const compact =
        `[voice-peer] close remote=${compactDeviceId(remoteId)} reason=${reason} ` +
        `hadPc=${hadPc} preserveAudio=${preserveRemoteAudio} clearConnId=${shouldClearConnectionId} ` +
        `${formatVoiceModeSuffix()}`;

      console.log(compact);
      recordCallReloadContext({ lastClosePeer: compact });

      if (shouldClearConnectionId) {
        clearCurrentConnectionId(remoteId, reason);
      }

      if (!preserveRemoteAudio) {
        setRemoteAudios((prev) => {
          const next = { ...prev };
          delete next[remoteId];
          return next;
        });
      }
    },
    [
      clearEndedRemoteAudio,
      clearPeerWatchdogTimers,
      clearReconnectTimer,
      clearCurrentConnectionId,
      emitPeerStates,
      hasLiveRemoteAudioStream,
      hasStaleEndedRemoteAudio,
      shouldHoldCloseForReconnectClearEnded,
    ]
  );

  const attemptSignalingRecoverRef = useRef<
    (remoteId: string, source: string) => Promise<boolean>
  >(async () => false);
  const attemptIceRestartRef = useRef<
    (remoteId: string) => Promise<boolean>
  >(async () => false);
  const attemptTurnFallbackForPeerRef = useRef<
    (remoteId: string, turnReason?: string) => Promise<boolean>
  >(async () => false);

  const getOrCreatePeerIceStats = useCallback((remoteId: string) => {
    let stats = peerIceDiagnosticsRef.current.get(remoteId);
    if (!stats) {
      stats = createEmptyPeerIceDiagnostics();
      peerIceDiagnosticsRef.current.set(remoteId, stats);
    }
    return stats;
  }, []);

  const clearPeerIceDiagnostics = useCallback((remoteId: string) => {
    peerIceDiagnosticsRef.current.delete(remoteId);
    checkingPlaybackStuckAtRef.current.delete(remoteId);
    const postTimer = iceRestartPostTimersRef.current.get(remoteId);
    if (postTimer) {
      window.clearTimeout(postTimer);
      iceRestartPostTimersRef.current.delete(remoteId);
    }
  }, []);

  const addRemoteIceCandidate = useCallback(
    async (
      remoteId: string,
      pc: RTCPeerConnection,
      candidate: RTCIceCandidateInit,
      connectionId: string | null
    ): Promise<boolean> => {
      const stats = getOrCreatePeerIceStats(remoteId);
      recordRemoteIceCandidate(stats, candidate);

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        logVoiceIceAddCandidateSuccess({ remoteId, connectionId, candidate });
        return true;
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string };
        logVoiceIceAddCandidateFailed({
          remoteId,
          connectionId,
          candidate,
          name: err?.name ?? "unknown",
          message: String(err?.message ?? "").slice(0, 120),
        });
        return false;
      }
    },
    [getOrCreatePeerIceStats]
  );

  const flushPendingIce = useCallback(
    async (
      remoteId: string,
      connectionId?: string
    ): Promise<{ pending: number; flushed: number; failed: number }> => {
      const pc = pcsRef.current.get(remoteId);
      if (!pc || !pc.remoteDescription) {
        return { pending: 0, flushed: 0, failed: 0 };
      }

      const current = connectionId ?? getCurrentConnectionId(remoteId);
      if (!current) {
        return { pending: 0, flushed: 0, failed: 0 };
      }

      const queued = pendingIceRef.current.get(remoteId) ?? [];
      if (!queued.length) {
        return { pending: 0, flushed: 0, failed: 0 };
      }

      let flushed = 0;
      let failed = 0;

      for (const candidate of queued) {
        const ok = await addRemoteIceCandidate(remoteId, pc, candidate, current);
        if (ok) flushed += 1;
        else failed += 1;
      }

      pendingIceRef.current.delete(remoteId);
      return { pending: queued.length, flushed, failed };
    },
    [addRemoteIceCandidate, getCurrentConnectionId]
  );

  const scheduleReconnect = useCallback(
    (
      remoteId: string,
      delay = 2000,
      opts: ScheduleReconnectOpts
    ): boolean => {
      const callerHint = getReconnectCallerHint(opts.callerHint);
      const reasonRaw = String(opts.reason ?? "").trim();
      const sourceRaw = String(opts.source ?? "").trim();

      const pcEarly = pcsRef.current.get(remoteId);
      const mediaEarly = getPeerMedia(remoteId);

      if (
        isUnspecifiedReconnectLabel(reasonRaw) ||
        isUnspecifiedReconnectLabel(sourceRaw)
      ) {
        console.warn(
          `[voice-peer] reconnect-blocked remote=${compactDeviceId(remoteId)} reason=missing_reconnect_reason ` +
            `source=${sourceRaw || "-"} requestedReason=${reasonRaw || "-"} callerHint=${callerHint} ` +
            `conn=${pcEarly?.connectionState ?? "-"} ice=${pcEarly?.iceConnectionState ?? "-"} ` +
            `tracks=${mediaEarly.remoteTracksCount} ${formatVoiceModeSuffix()}`
        );
        return false;
      }

      if (!isLocalTrackLive(localAudioTrackRef, localStreamRef)) {
        console.warn(
          `[voice-peer] reconnect-skip remote=${compactDeviceId(remoteId)} reason=${reasonRaw} source=${sourceRaw} ` +
            `micReady=${micReady} localTrack=${getLocalTrackReadyState(localAudioTrackRef, localStreamRef)} callerHint=${callerHint}`
        );
        return false;
      }

      const source = sourceRaw;
      let reason = reasonRaw;

      const p2pHoldRemainingMs = getP2pDirectFailedHoldRemainingMs(remoteId);
      if (p2pHoldRemainingMs != null && opts?.force !== true) {
        console.log(
          `[voice-peer] reconnect-hold remote=${compactDeviceId(remoteId)} reason=p2p_direct_failed_turn_disabled ` +
            `holdRemainingMs=${p2pHoldRemainingMs} source=${source} ${formatVoiceModeSuffix()}`
        );
        return false;
      }

      const pc = pcsRef.current.get(remoteId);
      const media = getPeerMedia(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      const waitCheck = getLiveStreamWaitConnectedCheckForPeer({
        pc,
        hasLiveRemoteStream: hasLiveRemoteAudioStream(remoteId),
        remoteTracksCount: media.remoteTracksCount,
        hasRemoteStream: media.hasRemoteStream,
        timestamps,
        connectStartedAt: connectStartedAtRef.current.get(remoteId),
      });

      const holdBlocksForce =
        waitCheck?.holdReason === "active_playback_wait_connected";
      if (waitCheck?.shouldHold && (!opts.force || holdBlocksForce)) {
        if (pc) {
          console.log(
            formatReconnectHoldLog(
              remoteId,
              source,
              pc,
              media.remoteTracksCount,
              waitCheck
            )
          );
        }
        return false;
      }

      if (waitCheck?.graceExpired) {
        reason = resolveGraceExpiredReconnectReason(reason);
      }

      const hasPlaybackProtection =
        (media.remoteTracksCount > 0 || media.hasRemoteStream) &&
        timestamps.lastPlaybackConfirmedAt == null &&
        (timestamps.lastPlaySuccessAt != null ||
          timestamps.lastPlaybackActiveAt != null);

      if (hasPlaybackProtection) {
        const stats = getOrCreatePeerIceStats(remoteId);
        if (hasNoRelayCandidates(stats)) {
          const transportFailed =
            pc?.connectionState === "failed" ||
            pc?.iceConnectionState === "failed";
          logVoiceIceP2pDirectFailed({
            remoteId,
            reason: transportFailed
              ? "failed_no_relay_candidate"
              : "no_relay_candidate",
            stats,
          });
          const turnReason = transportFailed
            ? "failed_with_host_srflx_only"
            : "host_srflx_checking_stuck";
          console.log(
            `[voice-peer] turn-fallback-needed remote=${compactDeviceId(remoteId)} ` +
              `reason=${turnReason} enabled=${turnFallbackEnabledRef.current} source=${source} ${formatVoiceModeSuffix()}`
          );
          void attemptTurnFallbackForPeerRef.current(remoteId, turnReason);
          return false;
        }
      }

      if (!opts.force && reconnectPendingRef.current.has(remoteId)) {
        const existing = reconnectPendingRef.current.get(remoteId)!;
        if (isUnspecifiedReconnectLabel(existing.reason)) {
          console.log(
            `[voice-peer] reconnect-cancel-unspecified remote=${compactDeviceId(remoteId)} ` +
              `newReason=${reason} newSource=${source} existingReason=${existing.reason} ${formatVoiceModeSuffix()}`
          );
          clearReconnectTimer(remoteId);
          reconnectPendingRef.current.delete(remoteId);
        } else {
          console.log(
            `[voice-peer] reconnect-deduped remote=${compactDeviceId(remoteId)} reason=${reason} source=${source} ` +
              `existing=${existing.reason} existingSource=${existing.source} ${formatVoiceModeSuffix()}`
          );
          voiceDebugLog("[voice-peer] reconnect-deduped", {
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason,
            source,
            existingReason: existing.reason,
            existingSource: existing.source,
            existingScheduledInMs: existing.scheduledInMs,
          });
          return false;
        }
      }

      clearReconnectTimer(remoteId);
      markRecoveryStart(remoteId);
      lastHealActionAtRef.current.set(remoteId, Date.now());

      reconnectPendingRef.current.set(remoteId, {
        reason,
        source,
        scheduledInMs: delay,
        scheduledAt: Date.now(),
      });

      console.log(
        `[voice-peer] reconnect-scheduled target=${compactDeviceId(remoteId)} reason=${reason} source=${source} delayMs=${delay} owner=${deviceId < remoteId} ` +
          `otherPeers=${buildPeerScopeSnapshot(pcsRef.current, getPeerMedia, remoteId)} ${formatVoiceModeSuffix()}`
      );

      const timer = window.setTimeout(() => {
        reconnectTimersRef.current.delete(remoteId);
        reconnectPendingRef.current.delete(remoteId);

        const nextConnectionId = makeConnectionId(deviceId, remoteId);
        console.log(
          `[voice-peer] reconnect-fire remote=${compactDeviceId(remoteId)} reason=${reason} source=${source} beforeClose pc=${!!pcsRef.current.get(remoteId)}`
        );

        closePeer(remoteId, {
          clearConnectionId: false,
          preserveRemoteAudio: hasLiveRemoteAudioStream(remoteId),
          reason,
        });
        console.log(
          `[voice-peer] track-ended-chain remote=${compactDeviceId(remoteId)} step=close reason=${reason} pc=${isUsablePeerConnection(pcsRef.current.get(remoteId))} ${formatVoiceModeSuffix()}`
        );
        assignConnectionId(remoteId, nextConnectionId, `reconnect_${reason}`);
        connectStartedAtRef.current.set(remoteId, Date.now());

        const ok =
          ensurePeerConnectionRef.current?.(remoteId, `reconnect_${reason}`, {
            force: true,
          }) ?? false;

        console.log(
          `[voice-peer] track-ended-chain remote=${compactDeviceId(remoteId)} ` +
            `step=ensure ok=${ok} pc=${isUsablePeerConnection(pcsRef.current.get(remoteId))} owner=${deviceId < remoteId} ${formatVoiceModeSuffix()}`
        );
      }, delay);

      reconnectTimersRef.current.set(remoteId, timer);
      return true;
    },
    [
      clearReconnectTimer,
      closePeer,
      deviceId,
      getOrCreatePeerIceStats,
      getP2pDirectFailedHoldRemainingMs,
      hasLiveRemoteAudioStream,
      localAudioTrackRef,
      localStreamRef,
      assignConnectionId,
      markRecoveryStart,
      micReady,
      getPeerMedia,
    ]
  );

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  const attachRemoteTrackDiagnostics = useCallback(
    (remoteId: string, track: MediaStreamTrack) => {
      const trackKey = track.id || `${remoteId}:${track.kind}`;
      const attached =
        attachedTrackIdsRef.current.get(remoteId) ?? new Set<string>();

      if (attached.has(trackKey)) return;

      attached.add(trackKey);
      attachedTrackIdsRef.current.set(remoteId, attached);

      const emitTrackEvent = (
        event: "ontrack" | "mute" | "unmute" | "ended",
        extra?: {
          elapsedMsSinceTrackEnded?: number;
          scheduledReconnectInMs?: number;
          reconnectScheduled?: boolean;
          pc?: RTCPeerConnection | null;
        }
      ) => {
        const pcForEvent = extra?.pc ?? pcsRef.current.get(remoteId) ?? null;
        logRemoteTrackEvent({
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          event,
          trackKind: track.kind,
          trackId: track.id,
          trackReadyState: track.readyState,
          trackMuted: track.muted,
          connectionState: pcForEvent?.connectionState ?? null,
          iceConnectionState: pcForEvent?.iceConnectionState ?? null,
          signalingState: pcForEvent?.signalingState ?? null,
          otherPeersSnapshot:
            event === "ended"
              ? buildPeerScopeSnapshot(
                  pcsRef.current,
                  getPeerMedia,
                  remoteId
                )
              : null,
          ...extra,
        });
      };

      const maybeLogTrackRecovery = (
        event: "ontrack" | "unmute",
        elapsedMsSinceTrackEnded?: number
      ) => {
        if (elapsedMsSinceTrackEnded == null) return;

        const pc = pcsRef.current.get(remoteId);
        finalizeRecovery(remoteId, pc, event, elapsedMsSinceTrackEnded);
      };

      const endedAtOnAttach = trackEndedAtRef.current.get(remoteId);
      const elapsedOnAttach =
        endedAtOnAttach != null ? Date.now() - endedAtOnAttach : undefined;
      emitTrackEvent("ontrack", { elapsedMsSinceTrackEnded: elapsedOnAttach });
      cancelTrackEndedHold(remoteId, "ontrack");
      maybeLogTrackRecovery("ontrack", elapsedOnAttach);

      track.onmute = () => {
        const endedAt = trackEndedAtRef.current.get(remoteId);
        const elapsedMsSinceTrackEnded =
          endedAt != null ? Date.now() - endedAt : undefined;
        emitTrackEvent("mute", { elapsedMsSinceTrackEnded });
      };

      track.onunmute = () => {
        const endedAt = trackEndedAtRef.current.get(remoteId);
        const elapsedMsSinceTrackEnded =
          endedAt != null ? Date.now() - endedAt : undefined;
        emitTrackEvent("unmute", { elapsedMsSinceTrackEnded });
        touchPeerSignal(remoteId, "unmute");
        emitMeshSummary("unmute", { immediate: true });
        cancelTrackEndedHold(remoteId, "unmute");
        maybeLogTrackRecovery("unmute", elapsedMsSinceTrackEnded);

        const pc = pcsRef.current.get(remoteId);
        if (pc) {
          syncRemoteAudioFromPc(remoteId, pc, "track_unmute");
        }
      };

      track.onended = () => {
        trackEndedAtRef.current.set(remoteId, Date.now());
        markRecoveryStart(remoteId);

        const pcBefore = pcsRef.current.get(remoteId);
        console.log(
          `[voice-peer] track-ended remote=${compactDeviceId(remoteId)} ` +
            `pc=${!!pcBefore} conn=${pcBefore?.connectionState ?? "-"} ` +
            `ice=${pcBefore?.iceConnectionState ?? "-"} track=${track.id.slice(-6)} ${formatVoiceModeSuffix()}`
        );

        if (pcBefore) {
          observePeerField(
            remoteId,
            "remoteTracksCount",
            pcBefore
              .getReceivers()
              .filter((r) => r.track?.readyState === "live").length,
            pcBefore
          );
        }

        console.log(
          `[voice-peer] track-ended-chain remote=${compactDeviceId(remoteId)} step=ended pc=${!!pcBefore} conn=${pcBefore?.connectionState ?? "-"} ${formatVoiceModeSuffix()}`
        );

        clearEndedRemoteAudio(remoteId, track);

        const holdCheck = getTrackEndedHoldCheck(remoteId, pcBefore);
        logTrackEndedHoldCheck(remoteId, holdCheck);

        if (holdCheck.shouldHold) {
          scheduleTrackEndedHold(remoteId, pcBefore);
          emitTrackEvent("ended", {
            scheduledReconnectInMs: TRACK_ENDED_HOLD_MS,
            reconnectScheduled: false,
            pc: pcBefore,
          });
          return;
        }

        if (
          peerEverConnectedRef.current.has(remoteId) &&
          voicePolicy.trackEndedSetConnecting
        ) {
          setPeerStateRef.current(remoteId, "connecting");
        }

        const reconnectScheduled = Boolean(
          scheduleReconnectRef.current?.(
            remoteId,
            voicePolicy.trackEndedReconnectMs,
            {
              reason: "remote_track_ended",
              source: "track_ended_handler",
              force: voicePolicy.trackEndedForceReconnect,
            }
          )
        );

        console.log(
          `[voice-peer] track-ended-chain remote=${compactDeviceId(remoteId)} step=schedule reconnect=${reconnectScheduled} delayMs=${voicePolicy.trackEndedReconnectMs} ${formatVoiceModeSuffix()}`
        );

        if (!reconnectScheduled && voicePolicy.trackEndedImmediateEnsure) {
          const ok =
            ensurePeerConnectionRef.current?.(remoteId, "track_ended_immediate", {
              force: true,
            }) ?? false;
          console.log(
            `[voice-peer] track-ended-chain remote=${compactDeviceId(remoteId)} step=immediate_ensure ok=${ok} pc=${isUsablePeerConnection(pcsRef.current.get(remoteId))} ${formatVoiceModeSuffix()}`
          );
        }

        if (voicePolicy.trackEndedBackupEnsure) {
          window.setTimeout(() => {
            if (isUsablePeerConnection(pcsRef.current.get(remoteId))) return;
            const ok =
              ensurePeerConnectionRef.current?.(remoteId, "track_ended_backup", {
                force: true,
              }) ?? false;
            console.log(
              `[voice-peer] track-ended-chain remote=${compactDeviceId(remoteId)} step=backup_ensure ok=${ok} pc=${isUsablePeerConnection(pcsRef.current.get(remoteId))} ${formatVoiceModeSuffix()}`
            );
          }, voicePolicy.trackEndedReconnectMs + 100);
        }

        emitTrackEvent("ended", {
          scheduledReconnectInMs: voicePolicy.trackEndedReconnectMs,
          reconnectScheduled,
          pc: pcBefore,
        });
      };
    },
    [
      cancelTrackEndedHold,
      clearEndedRemoteAudio,
      deviceId,
      emitMeshSummary,
      finalizeRecovery,
      getPeerMedia,
      getTrackEndedHoldCheck,
      markRecoveryStart,
      observePeerField,
      scheduleTrackEndedHold,
      sessionId,
      syncRemoteAudioFromPc,
      touchPeerSignal,
    ]
  );

  useEffect(() => {
    attachRemoteTrackDiagnosticsRef.current = attachRemoteTrackDiagnostics;
  }, [attachRemoteTrackDiagnostics]);

  const isEligibleForIceRestart = useCallback(
    (remoteId: string) => {
      const media = getPeerMedia(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      return (
        media.remoteTracksCount > 0 &&
        timestamps.lastPlaySuccessAt != null &&
        timestamps.lastPlaybackConfirmedAt == null &&
        (iceRestartAttemptsRef.current.get(remoteId) ?? 0) < MAX_ICE_RESTART_ATTEMPTS
      );
    },
    [getPeerMedia]
  );

  const logIceCheckingDiagnostics = useCallback(
    (remoteId: string, pc: RTCPeerConnection) => {
      const stats = getOrCreatePeerIceStats(remoteId);
      logVoiceIceCheckingStuck({
        remoteId,
        stats,
        conn: pc.connectionState,
        ice: pc.iceConnectionState,
      });
      if (hasNoRelayCandidates(stats)) {
        const transportFailed =
          pc.connectionState === "failed" || pc.iceConnectionState === "failed";
        logVoiceIceP2pDirectFailed({
          remoteId,
          reason: transportFailed
            ? "failed_no_relay_candidate"
            : "no_relay_candidate",
          stats,
        });
      }
      const insufficient = evaluateInsufficientRemoteCandidates(stats);
      if (insufficient) {
        logVoiceIceInsufficientCandidates({
          remoteId,
          reason: insufficient,
          stats,
        });
      }
    },
    [getOrCreatePeerIceStats]
  );

  const scheduleIceCheckingTimeout = useCallback(
    (remoteId: string, connectionId: string, pc: RTCPeerConnection) => {
      const existing = iceCheckingTimersRef.current.get(remoteId);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        iceCheckingTimersRef.current.delete(remoteId);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        const currentPc = pcsRef.current.get(remoteId);
        if (!currentPc || currentPc !== pc) return;

        if (currentPc.iceConnectionState !== "checking") return;

        logIceCheckingDiagnostics(remoteId, currentPc);

        if (isEligibleForIceRestart(remoteId)) {
          return;
        }

        const stats = getOrCreatePeerIceStats(remoteId);
        if (hasNoRelayCandidates(stats) && !turnFallbackEnabledRef.current) {
          p2pDirectFailedHoldUntilRef.current.set(
            remoteId,
            Date.now() + P2P_DIRECT_FAILED_HOLD_MS
          );
          console.log(
            `[voice-peer] reconnect-hold remote=${compactDeviceId(remoteId)} reason=p2p_direct_failed_turn_disabled ` +
              `source=checking_timeout ${formatVoiceModeSuffix()}`
          );
          return;
        }

        logPeerStateWarning({
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          reason: "checking_timeout",
          pc: currentPc,
          media: getPeerMedia(remoteId),
        });
        setPeerMeta(remoteId, { lastWarning: "checking_timeout" });
        emitMeshSummary("checking_timeout", { immediate: true });

        markRecoveryStart(remoteId);
        scheduleReconnectRef.current?.(remoteId, 1200, {
          reason: "checking_timeout",
          source: "checking_timeout",
        });
      }, ICE_CHECKING_DIAGNOSTICS_MS);

      iceCheckingTimersRef.current.set(remoteId, timer);
    },
    [
      deviceId,
      emitMeshSummary,
      getCurrentConnectionId,
      getPeerMedia,
      isEligibleForIceRestart,
      logIceCheckingDiagnostics,
      getOrCreatePeerIceStats,
      markRecoveryStart,
      sessionId,
      setPeerMeta,
    ]
  );

  const schedulePostIceRestartReconnect = useCallback(
    (remoteId: string, connectionId: string, pc: RTCPeerConnection) => {
      const existing = iceRestartPostTimersRef.current.get(remoteId);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        iceRestartPostTimersRef.current.delete(remoteId);

        const currentPc = pcsRef.current.get(remoteId);
        if (!currentPc || currentPc !== pc) return;
        if (
          currentPc.iceConnectionState !== "checking" &&
          currentPc.connectionState !== "connecting"
        ) {
          return;
        }

        logIceCheckingDiagnostics(remoteId, currentPc);

        const stats = getOrCreatePeerIceStats(remoteId);
        if (hasNoRelayCandidates(stats)) {
          void attemptTurnFallbackForPeerRef
            .current(remoteId, "host_srflx_checking_stuck")
            .then((started) => {
            if (started) return;

            const holdUntil = p2pDirectFailedHoldUntilRef.current.get(remoteId);
            if (holdUntil != null && Date.now() < holdUntil) {
              return;
            }

            logPeerStateWarning({
              sessionId,
              localDeviceId: deviceId,
              remoteDeviceId: remoteId,
              reason: "checking_timeout",
              pc: currentPc,
              media: getPeerMedia(remoteId),
            });
            markRecoveryStart(remoteId);
            scheduleReconnectRef.current?.(remoteId, 1200, {
              reason: "checking_timeout_after_ice_restart",
              source: "checking_timeout_after_ice_restart",
            });
          });
          return;
        }

        logPeerStateWarning({
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          reason: "checking_timeout",
          pc: currentPc,
          media: getPeerMedia(remoteId),
        });
        markRecoveryStart(remoteId);
        scheduleReconnectRef.current?.(remoteId, 1200, {
          reason: "checking_timeout_after_ice_restart",
          source: "checking_timeout_after_ice_restart",
        });
      }, ICE_RESTART_POST_TIMEOUT_MS);

      iceRestartPostTimersRef.current.set(remoteId, timer);
    },
    [
      deviceId,
      getOrCreatePeerIceStats,
      getPeerMedia,
      logIceCheckingDiagnostics,
      markRecoveryStart,
      sessionId,
    ]
  );

  const scheduleConnectingTimeout = useCallback(
    (remoteId: string, connectionId: string, pc: RTCPeerConnection) => {
      const existing = connectingTimersRef.current.get(remoteId);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        connectingTimersRef.current.delete(remoteId);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        const currentPc = pcsRef.current.get(remoteId);
        if (!currentPc || currentPc !== pc) return;

        if (currentPc.connectionState !== "connecting") return;

        logPeerStateWarning({
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          reason: "connecting_timeout",
          pc: currentPc,
          media: getPeerMedia(remoteId),
        });
        setPeerMeta(remoteId, { lastWarning: "connecting_timeout" });
        emitMeshSummary("connecting_timeout", { immediate: true });

        markRecoveryStart(remoteId);
        scheduleReconnectRef.current?.(remoteId, 1200, {
          reason: "connecting_timeout",
          source: "connecting_timeout",
        });
      }, 12000);

      connectingTimersRef.current.set(remoteId, timer);
    },
    [deviceId, getCurrentConnectionId, getPeerMedia, markRecoveryStart, sessionId, setPeerMeta, emitMeshSummary]
  );

  useEffect(() => {
    turnFallbackEnabledRef.current = turnFallbackEnabled;
  }, [turnFallbackEnabled]);

  const enableTurnFallback = useCallback(async () => {
    if (!turnFallbackEnabledRef.current) return false;
    if (voiceRouteRef.current === "turn") return true;

    if (turnIceServersRef.current && turnIceServersRef.current.length > 0) {
      voiceRouteRef.current = "turn";
      iceServersRef.current = turnIceServersRef.current;
      return true;
    }

    if (loadingTurnRef.current) return false;

    loadingTurnRef.current = true;

    try {
      const res = await fetch("/api/turn", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();

      const nextIceServers = Array.isArray(data?.ice_servers)
        ? data.ice_servers
        : Array.isArray(data?.iceServers)
          ? data.iceServers
          : null;

      if (nextIceServers && nextIceServers.length > 0) {
        turnIceServersRef.current = nextIceServers;
        voiceRouteRef.current = "turn";
        iceServersRef.current = nextIceServers;
        return true;
      }

      console.warn("[call] TURN response has no ice_servers", data);
      return false;
    } catch (e) {
      console.warn("[call] TURN load failed", e);
      return false;
    } finally {
      loadingTurnRef.current = false;
    }
  }, []);

  const attemptTurnFallbackForPeer = useCallback(
    async (remoteId: string, turnReason = "host_srflx_checking_stuck") => {
      if (turnFallbackAttemptedRef.current.get(remoteId)) {
        return false;
      }

      const stats = getOrCreatePeerIceStats(remoteId);
      if (!hasNoRelayCandidates(stats)) {
        return false;
      }

      console.log(
        `[voice-peer] turn-fallback-needed remote=${compactDeviceId(remoteId)} ` +
          `reason=${turnReason} enabled=${turnFallbackEnabledRef.current} ${formatVoiceModeSuffix()}`
      );

      if (!turnFallbackEnabledRef.current) {
        p2pDirectFailedHoldUntilRef.current.set(
          remoteId,
          Date.now() + P2P_DIRECT_FAILED_HOLD_MS
        );
        console.log(
          `[voice-peer] reconnect-hold remote=${compactDeviceId(remoteId)} ` +
            `reason=p2p_direct_failed_turn_disabled ${formatVoiceModeSuffix()}`
        );
        return false;
      }

      turnFallbackAttemptedRef.current.set(remoteId, true);
      const ok = await enableTurnFallback();
      if (!ok) {
        console.warn(
          `[voice-peer] turn-fallback-failed remote=${compactDeviceId(remoteId)} ${formatVoiceModeSuffix()}`
        );
        return false;
      }

      console.log(
        `[voice-peer] turn-fallback-enabled remote=${compactDeviceId(remoteId)} ${formatVoiceModeSuffix()}`
      );

      peerIceDiagnosticsRef.current.delete(remoteId);

      const nextConnectionId = makeConnectionId(deviceId, remoteId);
      closePeer(remoteId, {
        clearConnectionId: false,
        preserveRemoteAudio: hasLiveRemoteAudioStream(remoteId),
        reason: "turn_fallback_host_srflx_stuck",
      });
      assignConnectionId(remoteId, nextConnectionId, "turn_fallback");
      connectStartedAtRef.current.set(remoteId, Date.now());
      iceRestartAttemptsRef.current.delete(remoteId);

      ensurePeerConnectionRef.current?.(
        remoteId,
        "turn_fallback_host_srflx_stuck",
        { force: true }
      );
      return true;
    },
    [
      assignConnectionId,
      closePeer,
      deviceId,
      enableTurnFallback,
      getOrCreatePeerIceStats,
      hasLiveRemoteAudioStream,
    ]
  );

  const createPeerConnection = useCallback(
    (remoteId: string, connectionId: string) => {
      const existing = pcsRef.current.get(remoteId);
      const currentId = getCurrentConnectionId(remoteId);

      if (existing && currentId === connectionId) {
        return existing;
      }

      if (existing && currentId !== connectionId) {
        const media = getPeerMedia(remoteId);
        const timestamps =
          peerSignalTimestampsRef.current.get(remoteId) ??
          emptyPeerSignalTimestamps();
        const recoverAction = evaluateStaleSignalRecoverAction({
          signalType: "create_pc",
          pc: existing,
          remoteTracksCount: media.remoteTracksCount,
          hasRemoteStream: media.hasRemoteStream,
          confirmedAt: timestamps.lastPlaybackConfirmedAt,
        });

        if (recoverAction !== "reject") {
          assignConnectionId(remoteId, connectionId, "create_pc_id_sync");
          return existing;
        }

        closePeer(remoteId, CLOSE_FOR_RECONNECT);
      }

      assignConnectionId(remoteId, connectionId, "create_pc");
      markConnectStart(remoteId);

      const currentIceServers =
        iceServersRef.current.length > 0
          ? iceServersRef.current
          : FALLBACK_ICE_SERVERS;

      const pc = new RTCPeerConnection({
        iceServers: currentIceServers,
        iceTransportPolicy: voiceRouteRef.current === "turn" ? "relay" : "all",
      });

      const localTrack = localAudioTrackRef.current;
      const localStream = localStreamRef.current;

      if (localTrack && localStream) {
        pc.addTrack(localTrack, localStream);

        const sender = pc
          .getSenders()
          .find((s) => s.track?.kind === "audio" || s.track === null);

        if (sender && isMuted) {
          void sender.replaceTrack(null);
        }
      }

      pc.onicecandidate = (event) => {
        if (pcsRef.current.get(remoteId) !== pc) return;

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId) return;

        const stats = getOrCreatePeerIceStats(remoteId);

        if (!event.candidate) {
          logVoiceIceGatheringComplete({
            remoteId,
            connectionId: activeConnectionId,
            stats,
          });
          return;
        }

        const candidateJson = event.candidate.toJSON
          ? event.candidate.toJSON()
          : event.candidate;

        recordLocalIceCandidate(stats, candidateJson);
        logVoiceIceLocalCandidate({
          remoteId,
          connectionId: activeConnectionId,
          candidate: candidateJson,
        });

        void sendSignal(remoteId, "ice", {
          connectionId: activeConnectionId,
          candidate: candidateJson,
        });
        touchPeerSignal(remoteId, "ice_sent");
        emitMeshSummary("ice_sent");
      };

      pc.ontrack = (event) => {
        if (pcsRef.current.get(remoteId) !== pc) return;
        if (!getCurrentConnectionId(remoteId)) return;

        const stream = event.streams?.[0];
        if (!stream) return;

        upsertRemoteAudio(remoteId, stream, { reason: "pc_ontrack", force: true });
        touchPeerSignal(remoteId, "ontrack");
        emitMeshSummary("pc_ontrack", { immediate: true });

        if (voicePolicy.ontrackDelayedPlayMs == null) {
          syncRemoteAudioFromPc(remoteId, pc, "ontrack_delayed");
          return;
        }

        window.setTimeout(() => {
          syncRemoteAudioFromPc(remoteId, pc, "ontrack_delayed");
        }, voicePolicy.ontrackDelayedPlayMs);
      };

      pc.onicegatheringstatechange = () => {
        syncPeerObservedStates(remoteId, pc);
        const stats = getOrCreatePeerIceStats(remoteId);
        stats.gatheringState = pc.iceGatheringState;
        logVoiceIceGatheringState({
          remoteId,
          state: pc.iceGatheringState,
        });
        if (pc.iceGatheringState === "complete") {
          logVoiceIceGatheringComplete({
            remoteId,
            connectionId: getCurrentConnectionId(remoteId),
            stats,
          });
        }
      };

      pc.onsignalingstatechange = () => {
        syncPeerObservedStates(remoteId, pc);
      };

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        syncPeerObservedStates(remoteId, pc);

        if (pcsRef.current.get(remoteId) !== pc) return;
        if (!getCurrentConnectionId(remoteId)) return;

        if (iceState === "checking") {
          scheduleIceCheckingTimeout(remoteId, connectionId, pc);
          const timestamps =
            peerSignalTimestampsRef.current.get(remoteId) ??
            emptyPeerSignalTimestamps();
          const media = getPeerMedia(remoteId);
          if (
            timestamps.lastPlaySuccessAt != null &&
            timestamps.lastPlaybackConfirmedAt == null &&
            media.remoteTracksCount > 0 &&
            !checkingPlaybackStuckAtRef.current.has(remoteId)
          ) {
            checkingPlaybackStuckAtRef.current.set(remoteId, Date.now());
          }
        } else {
          const checkingTimer = iceCheckingTimersRef.current.get(remoteId);
          if (checkingTimer) {
            window.clearTimeout(checkingTimer);
            iceCheckingTimersRef.current.delete(remoteId);
          }
        }

        if (iceState === "connected" || iceState === "completed") {
          markPeerLastConnected(remoteId);
          checkingPlaybackStuckAtRef.current.delete(remoteId);
          iceRestartAttemptsRef.current.delete(remoteId);
          p2pDirectFailedHoldUntilRef.current.delete(remoteId);
          orphanRemoteAudioAtRef.current.delete(remoteId);
          if (orphanRemoteAudioRef.current.delete(remoteId)) {
            emitPeerStates();
          }
          orphanRemoteAudioLoggedRef.current.delete(remoteId);
        }

        if (iceState === "disconnected") {
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "disconnected",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "connecting");
          scheduleReconnect(remoteId, 1200, {
            reason: "ice_disconnected",
            source: "pc_oniceconnectionstatechange",
          });
        }

        if (iceState === "failed") {
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "failed",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "failed");
          void logVoiceConnection(remoteId, pc, "failed");

          if (
            voiceRouteRef.current === "stun" &&
            turnFallbackEnabledRef.current
          ) {
            void enableTurnFallback().then((ok) => {
              if (!ok) {
                scheduleReconnect(remoteId, 1200, {
                  reason: "ice_failed",
                  source: "pc_oniceconnectionstatechange",
                });
                return;
              }

              const nextConnectionId = makeConnectionId(deviceId, remoteId);
              closePeer(remoteId, CLOSE_FOR_RECONNECT);
              assignConnectionId(remoteId, nextConnectionId, "ice_failed_turn_fallback");
              connectStartedAtRef.current.set(remoteId, Date.now());
              scheduleReconnect(remoteId, voicePolicy.fastReconnectMs, {
                reason: "ice_failed",
                source: "pc_oniceconnectionstatechange",
              });
            });

            return;
          }

          scheduleReconnect(remoteId, 1200, {
            reason: "ice_failed",
            source: "pc_oniceconnectionstatechange",
          });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        syncPeerObservedStates(remoteId, pc);

        if (pcsRef.current.get(remoteId) !== pc) return;
        if (!getCurrentConnectionId(remoteId)) return;

        if (state === "connecting") {
          setPeerState(remoteId, "connecting");
          scheduleConnectingTimeout(remoteId, connectionId, pc);

          const timestamps =
            peerSignalTimestampsRef.current.get(remoteId) ??
            emptyPeerSignalTimestamps();
          const media = getPeerMedia(remoteId);
          if (
            timestamps.lastPlaySuccessAt != null &&
            timestamps.lastPlaybackConfirmedAt == null &&
            media.remoteTracksCount > 0 &&
            !checkingPlaybackStuckAtRef.current.has(remoteId)
          ) {
            checkingPlaybackStuckAtRef.current.set(remoteId, Date.now());
          }

          if (
            voiceRouteRef.current === "stun" &&
            turnFallbackEnabledRef.current
          ) {
            window.setTimeout(() => {
              const currentPc = pcsRef.current.get(remoteId);
              if (!currentPc) return;
              if (!turnFallbackEnabledRef.current) return;

              const stillBad =
                currentPc.connectionState === "connecting" ||
                currentPc.iceConnectionState === "checking" ||
                currentPc.iceConnectionState === "disconnected";

              if (!stillBad) return;

              void enableTurnFallback().then((ok) => {
                if (!ok) return;

                const nextConnectionId = makeConnectionId(deviceId, remoteId);
                closePeer(remoteId, CLOSE_FOR_RECONNECT);
                assignConnectionId(
                  remoteId,
                  nextConnectionId,
                  "connecting_turn_fallback"
                );
                connectStartedAtRef.current.set(remoteId, Date.now());
                scheduleReconnect(remoteId, voicePolicy.fastReconnectMs, {
                  reason: "connecting_stuck",
                  source: "pc_onconnectionstatechange_turn_probe",
                });
              });
            }, 5000);
          }
        } else {
          const connectingTimer = connectingTimersRef.current.get(remoteId);
          if (connectingTimer) {
            window.clearTimeout(connectingTimer);
            connectingTimersRef.current.delete(remoteId);
          }
        }

        if (state === "connected") {
          peerEverConnectedRef.current.add(remoteId);
          markPeerLastConnected(remoteId);
          setPeerState(remoteId, "connected");
          clearReconnectTimer(remoteId);
          clearPeerWatchdogTimers(remoteId);
          maybeLogRecoverySuccess(remoteId, pc);
          syncRemoteAudioFromPc(remoteId, pc, "pc_connected");

          const sender = pc
            .getSenders()
            .find((s) => s.track?.kind === "audio" || s.track === null);

          const track = localAudioTrackRef.current;

          if (sender && track) {
            void sender.replaceTrack(isMuted ? null : track);
          }

          window.setTimeout(() => {
            void logVoiceConnection(remoteId, pc, "connected");
          }, 1000);
        }

        if (state === "disconnected") {
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "disconnected",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "connecting");
          scheduleReconnect(remoteId, 1200, {
            reason: "pc_disconnected",
            source: "pc_onconnectionstatechange",
          });
        }

        if (state === "failed") {
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "failed",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "failed");
          void logVoiceConnection(remoteId, pc, "failed");

          if (
            voiceRouteRef.current === "stun" &&
            turnFallbackEnabledRef.current
          ) {
            void enableTurnFallback().then((ok) => {
              if (!ok) {
                closePeer(remoteId, CLOSE_FOR_RECONNECT);
                scheduleReconnect(remoteId, 1200, {
                  reason: "pc_failed",
                  source: "pc_onconnectionstatechange",
                });
                return;
              }

              const nextConnectionId = makeConnectionId(deviceId, remoteId);
              closePeer(remoteId, CLOSE_FOR_RECONNECT);
              assignConnectionId(
                remoteId,
                nextConnectionId,
                "conn_failed_turn_fallback"
              );
              connectStartedAtRef.current.set(remoteId, Date.now());
              scheduleReconnect(remoteId, voicePolicy.fastReconnectMs, {
                reason: "pc_failed",
                source: "pc_onconnectionstatechange",
              });
            });

            return;
          }

          scheduleReconnect(remoteId, 1200, {
            reason: "pc_failed",
            source: "pc_onconnectionstatechange",
          });
        }

        if (state === "closed") {
          logPeerStateWarning({
            sessionId,
            localDeviceId: deviceId,
            remoteDeviceId: remoteId,
            reason: "closed",
            pc,
            media: getPeerMedia(remoteId),
          });
          setPeerState(remoteId, "idle");
        }
      };

      syncPeerObservedStates(remoteId, pc);

      pcsRef.current.set(remoteId, pc);
      return pc;
    },
    [
      assignConnectionId,
      clearPeerWatchdogTimers,
      clearReconnectTimer,
      closePeer,
      deviceId,
      enableTurnFallback,
      getCurrentConnectionId,
      getOrCreatePeerIceStats,
      getPeerMedia,
      isMuted,
      localAudioTrackRef,
      localStreamRef,
      logVoiceConnection,
      markConnectStart,
      markPeerLastConnected,
      maybeLogRecoverySuccess,
      scheduleConnectingTimeout,
      scheduleIceCheckingTimeout,
      scheduleReconnect,
      sendSignal,
      sessionId,
      setPeerState,
      syncPeerObservedStates,
      syncRemoteAudioFromPc,
      touchPeerSignal,
      emitMeshSummary,
      upsertRemoteAudio,
    ]
  );

  const startPeerOffer = useCallback(
    async (
      remoteId: string,
      opts?: { force?: boolean; reason?: string }
    ) => {
      const isOfferOwner = deviceId < remoteId;
      const force = opts?.force === true;
      const reason = opts?.reason ?? "unspecified";

      if (!isOfferOwner && !force) return;

      if (!isLocalTrackLive(localAudioTrackRef, localStreamRef)) return;

      const hasRemoteStream = hasLiveRemoteAudioStream(remoteId);
      const existingPc = pcsRef.current.get(remoteId);

      if (hasRemoteStream) return;

      if (
        !force &&
        existingPc &&
        (existingPc.connectionState === "connected" ||
          existingPc.signalingState === "have-local-offer" ||
          existingPc.signalingState === "have-remote-offer" ||
          existingPc.signalingState !== "stable")
      ) {
        return;
      }

      const connectionId =
        getCurrentConnectionId(remoteId) ?? makeConnectionId(deviceId, remoteId);

      if (!getCurrentConnectionId(remoteId)) {
        assignConnectionId(remoteId, connectionId, "offer_create");
      }

      markConnectStart(remoteId);
      clearNoStreamNoOfferTimer(remoteId);
      clearPassiveWaitOfferTimer(remoteId);

      let pc = existingPc;
      if (!isUsablePeerConnection(pc)) {
        pc = createPeerConnection(remoteId, connectionId);
      }

      if (!pc) return;

      if (offeredPeersRef.current.has(remoteId) && !force) return;
      if (pc.signalingState !== "stable") {
        if (!force) return;
        closePeer(remoteId, {
          clearConnectionId: false,
          preserveRemoteAudio: hasLiveRemoteAudioStream(remoteId),
          reason: `force_offer_reset_${reason}`,
        });
        assignConnectionId(remoteId, connectionId, "force_offer_reset");
        pc = createPeerConnection(remoteId, connectionId);
      }

      if (pc.signalingState !== "stable") return;

      offeredPeersRef.current.add(remoteId);
      clearReconnectTimer(remoteId);
      setPeerState(remoteId, "connecting");

      console.log(
        `[voice-peer] offer-create-start remote=${compactDeviceId(remoteId)} reason=${reason} ` +
          `force=${force} owner=${isOfferOwner} ${formatVoiceModeSuffix()}`
      );

      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });

        const activeConnectionId = getCurrentConnectionId(remoteId);

        if (!activeConnectionId || activeConnectionId !== connectionId) {
          offeredPeersRef.current.delete(remoteId);
          return;
        }

        if (pc.signalingState !== "stable") {
          offeredPeersRef.current.delete(remoteId);
          return;
        }

        await pc.setLocalDescription(offer);

        await sendSignal(remoteId, "offer", {
          connectionId,
          sdp: pc.localDescription,
        });
        touchPeerSignal(remoteId, "offer_sent");
        emitMeshSummary("offer_sent", { immediate: true });

        if (reason === "manual_reconnect") {
          console.log(
            `[voice-signal] offer-sent remote=${compactDeviceId(remoteId)} reason=manual_reconnect ` +
              `connectionId=${compactConnectionId(connectionId)} ${formatVoiceModeSuffix()}`
          );
        }

        console.log(
          `[voice-peer] offer-sent remote=${compactDeviceId(remoteId)} reason=${reason} ` +
            `force=${force} owner=${isOfferOwner} conn=${pc.connectionState} ice=${pc.iceConnectionState} ` +
            `sig=${pc.signalingState} ${formatVoiceModeSuffix()}`
        );
      } catch (e) {
        offeredPeersRef.current.delete(remoteId);
        console.error(
          `[voice-peer] offer-create-failed remote=${compactDeviceId(remoteId)} reason=${reason} force=${force}`,
          e
        );
      }
    },
    [
      clearNoStreamNoOfferTimer,
      clearPassiveWaitOfferTimer,
      clearReconnectTimer,
      closePeer,
      createPeerConnection,
      deviceId,
      emitMeshSummary,
      getCurrentConnectionId,
      hasLiveRemoteAudioStream,
      localAudioTrackRef,
      localStreamRef,
      markConnectStart,
      sendSignal,
      assignConnectionId,
      setPeerState,
      touchPeerSignal,
    ]
  );

  const maybeStartOffer = useCallback(
    async (remoteId: string) => {
      await startPeerOffer(remoteId, { reason: "maybe_start_offer" });
    },
    [startPeerOffer]
  );

  useEffect(() => {
    maybeStartOfferRef.current = startPeerOffer;
  }, [startPeerOffer]);

  const schedulePassiveWaitOfferTimeout = useCallback(
    (remoteId: string, triggerReason: string) => {
      clearPassiveWaitOfferTimer(remoteId);
      if (deviceId < remoteId) return;

      const timer = window.setTimeout(() => {
        passiveWaitOfferTimersRef.current.delete(remoteId);
        const pc = pcsRef.current.get(remoteId);
        if (!pc || hasLiveRemoteAudioStream(remoteId)) return;

        if (
          pc.signalingState === "have-remote-offer" ||
          pc.connectionState === "connected"
        ) {
          return;
        }

        console.log(
          `[voice-peer] passive-wait-offer-timeout remote=${compactDeviceId(remoteId)} action=force_offer reason=ended_stream_reconnect_timeout trigger=${triggerReason} ${formatVoiceModeSuffix()}`
        );

        void startPeerOffer(remoteId, {
          force: true,
          reason: "ended_stream_reconnect_timeout",
        });
      }, PASSIVE_WAIT_OFFER_TIMEOUT_MS);

      passiveWaitOfferTimersRef.current.set(remoteId, timer);
    },
    [clearPassiveWaitOfferTimer, deviceId, hasLiveRemoteAudioStream, startPeerOffer]
  );

  const scheduleNoStreamNoOfferTimeout = useCallback(
    (remoteId: string, triggerReason: string) => {
      clearNoStreamNoOfferTimer(remoteId);

      const selfMember = members.find((m) => m.device_id === deviceId);
      const localInCall = selfMember?.is_in_call !== false;
      const remoteInCall = isRemoteInCall(remoteId);
      if (!localInCall || !remoteInCall) return;

      const timer = window.setTimeout(() => {
        noStreamNoOfferTimersRef.current.delete(remoteId);

        const pc = pcsRef.current.get(remoteId);
        if (!pc || hasLiveRemoteAudioStream(remoteId)) return;

        const media = getPeerMedia(remoteId);
        const offered = offeredPeersRef.current.has(remoteId);
        const deadlock = isNoStreamNoOfferDeadlock({
          pc,
          hasLiveRemoteStream: hasLiveRemoteAudioStream(remoteId),
          offered,
          hasRemoteStream: media.hasRemoteStream,
          remoteTracksCount: media.remoteTracksCount,
        });

        if (!deadlock) return;

        console.log(
          `[voice-peer] no-stream-no-offer-timeout remote=${compactDeviceId(remoteId)} action=force_offer ` +
            `conn=${pc.connectionState} ice=${pc.iceConnectionState} sig=${pc.signalingState} ` +
            `owner=${deviceId < remoteId} trigger=${triggerReason} ${formatVoiceModeSuffix()}`
        );

        void startPeerOffer(remoteId, {
          force: true,
          reason: "no_stream_no_offer_timeout",
        });
      }, NO_STREAM_NO_OFFER_FORCE_MS);

      noStreamNoOfferTimersRef.current.set(remoteId, timer);
    },
    [
      clearNoStreamNoOfferTimer,
      deviceId,
      getPeerMedia,
      hasLiveRemoteAudioStream,
      isRemoteInCall,
      members,
      startPeerOffer,
    ]
  );

  const hardResetPeerForManualReconnect = useCallback(
    async (
      remoteId: string,
      opts: {
        resetLogReason: string;
        logManualHardReset?: boolean;
      }
    ) => {
      if (!remoteId || remoteId === deviceId) return;

      if (opts.logManualHardReset) {
        console.log(
          `[voice-peer] manual-hard-reset remote=${compactDeviceId(remoteId)} reason=${opts.resetLogReason} ${formatVoiceModeSuffix()}`
        );
      }

      clearPeerWatchdogTimers(remoteId);
      clearReconnectTimer(remoteId);
      reconnectPendingRef.current.delete(remoteId);
      lastHealActionAtRef.current.delete(remoteId);
      peerHealActionRef.current.delete(remoteId);
      p2pDirectFailedHoldUntilRef.current.delete(remoteId);
      turnFallbackAttemptedRef.current.delete(remoteId);
      iceRestartAttemptsRef.current.delete(remoteId);
      checkingPlaybackStuckAtRef.current.delete(remoteId);
      const iceRestartPostTimer = iceRestartPostTimersRef.current.get(remoteId);
      if (iceRestartPostTimer) {
        window.clearTimeout(iceRestartPostTimer);
        iceRestartPostTimersRef.current.delete(remoteId);
      }
      audioUnconfirmedTimeoutNotifiedRef.current.delete(remoteId);
      audioReplayAtRef.current.delete(remoteId);
      loggedConnectedRef.current.delete(remoteId);
      recoveryStartedAtRef.current.delete(remoteId);
      pendingIceRef.current.delete(remoteId);
      peerSignalTimestampsRef.current.set(remoteId, emptyPeerSignalTimestamps());
      peerIceDiagnosticsRef.current.delete(remoteId);
      peerMetaRef.current.delete(remoteId);
      orphanRemoteAudioAtRef.current.delete(remoteId);
      orphanRemoteAudioRef.current.delete(remoteId);
      orphanRemoteAudioLoggedRef.current.delete(remoteId);
      clearEndedRemoteAudio(remoteId);

      manualHardResetHealPassRef.current.add(remoteId);

      closePeer(remoteId, {
        clearConnectionId: true,
        preserveRemoteAudio: false,
        reason: `hard_reset_${opts.resetLogReason}`,
      });

      const newConnectionId = makeConnectionId(deviceId, remoteId);
      assignConnectionId(remoteId, newConnectionId, "manual_hard_reset");
      connectStartedAtRef.current.set(remoteId, Date.now());
      offeredPeersRef.current.delete(remoteId);
      startedPeersRef.current.delete(remoteId);
      setPeerState(remoteId, "connecting");

      emitPeerStates();

      console.log(
        `[voice-peer] manual-hard-reset-done remote=${compactDeviceId(remoteId)} reason=${opts.resetLogReason} ${formatVoiceModeSuffix()}`
      );
    },
    [
      assignConnectionId,
      clearEndedRemoteAudio,
      clearPeerWatchdogTimers,
      clearReconnectTimer,
      closePeer,
      deviceId,
      emitPeerStates,
      setPeerState,
    ]
  );

  const beginManualReconnectAfterHardReset = useCallback(
    async (
      remoteId: string,
      opts?: { skipReconnectRequest?: boolean; forceOffer?: boolean }
    ) => {
      const isOfferOwner = deviceId < remoteId;
      const connectionId = getCurrentConnectionId(remoteId);
      if (!connectionId) return;

      if (isOfferOwner || opts?.forceOffer) {
        await startPeerOffer(remoteId, { force: true, reason: "manual_reconnect" });
        return;
      }

      if (!opts?.skipReconnectRequest) {
        await sendSignal(remoteId, "reconnect-request", { connectionId });
        console.log(
          `[voice-signal] reconnect-request-sent remote=${compactDeviceId(remoteId)} ` +
            `connectionId=${compactConnectionId(connectionId)} ${formatVoiceModeSuffix()}`
        );
      }

      createPeerConnection(remoteId, connectionId);
      setPeerState(remoteId, "connecting");
      scheduleNoStreamNoOfferTimeout(remoteId, "manual_hard_reset");
    },
    [
      createPeerConnection,
      deviceId,
      getCurrentConnectionId,
      scheduleNoStreamNoOfferTimeout,
      sendSignal,
      setPeerState,
      startPeerOffer,
    ]
  );

  const manualPeerHardReset = useCallback(
    async (remoteId: string) => {
      await hardResetPeerForManualReconnect(remoteId, {
        resetLogReason: "user_requested_audio_reconnect",
        logManualHardReset: true,
      });
      await beginManualReconnectAfterHardReset(remoteId);
    },
    [beginManualReconnectAfterHardReset, hardResetPeerForManualReconnect]
  );

  const ensurePeerConnection = useCallback(
    (
      remoteId: string,
      reason: string,
      opts?: EnsurePeerConnectionOpts
    ): boolean => {
      const isOfferOwner = deviceId < remoteId;
      const compact = compactDeviceId(remoteId);
      const force = opts?.force === true;
      const mode = isOfferOwner ? "offer" : "passive_wait_offer";

      console.log(
        `[voice-peer] ensure-start target=${compact} reason=${reason} force=${force} ${formatVoiceModeSuffix()}`
      );

      if (!micReady) {
        logEnsureSkipped(remoteId, reason, "mic_not_ready");
        return false;
      }

      if (!signalReady) {
        logEnsureSkipped(remoteId, reason, "signal_not_ready");
        return false;
      }

      const localTrackState = getLocalTrackReadyState(
        localAudioTrackRef,
        localStreamRef
      );
      if (!isLocalTrackLive(localAudioTrackRef, localStreamRef)) {
        logEnsureSkipped(
          remoteId,
          reason,
          "local_track_not_live",
          `micReady=${micReady} localTrack=${localTrackState}`
        );
        return false;
      }

      if (!isRemoteInCall(remoteId)) {
        logEnsureSkipped(remoteId, reason, "member_not_in_call");
        return false;
      }

      if (isSelfInitiatedHealEnsureReason(reason)) {
        if (!manualHardResetHealPassRef.current.delete(remoteId)) {
          const holdRemainingMs = getP2pDirectFailedHoldRemainingMs(remoteId);
          if (holdRemainingMs != null) {
            logEnsureSkipped(
              remoteId,
              reason,
              "p2p_direct_failed_turn_disabled_hold",
              `holdRemainingMs=${holdRemainingMs}`
            );
            return false;
          }
        }
      }

      const existing = pcsRef.current.get(remoteId) ?? null;
      const hasUsablePc = isUsablePeerConnection(existing);

      if (
        hasUsablePc &&
        existing!.connectionState === "connected" &&
        (existing!.iceConnectionState === "connected" ||
          existing!.iceConnectionState === "completed")
      ) {
        logEnsureSkipped(remoteId, reason, "already_has_pc");
        return true;
      }

      if (!force && hasUsablePc) {
        const blockReason = getReconnectBlockReason(remoteId);
        if (blockReason === "reconnect_already_scheduled") {
          logEnsureSkipped(remoteId, reason, "blocked_by_reconnect_pending");
          return false;
        }
        if (blockReason === "heal_cooldown") {
          logEnsureSkipped(remoteId, reason, "blocked_by_cooldown");
          return false;
        }
      }

      reconnectPendingRef.current.delete(remoteId);
      clearReconnectTimer(remoteId);
      if (force || !hasUsablePc) {
        lastHealActionAtRef.current.delete(remoteId);
      }

      if (hasUsablePc) {
        closePeer(remoteId, {
          clearConnectionId: false,
          preserveRemoteAudio: hasLiveRemoteAudioStream(remoteId),
          reason: `ensure_replace_${reason}`,
        });
      }

      let connectionId = getCurrentConnectionId(remoteId);
      if (!connectionId) {
        connectionId = makeConnectionId(deviceId, remoteId);
        assignConnectionId(remoteId, connectionId, "ensure_peer_connection");
      }

      markConnectStart(remoteId);
      offeredPeersRef.current.delete(remoteId);

      if (isOfferOwner) {
        void maybeStartOffer(remoteId);
      } else {
        createPeerConnection(remoteId, connectionId);
        setPeerState(remoteId, "connecting");
        if (isEndedStreamReconnectReason(reason)) {
          schedulePassiveWaitOfferTimeout(remoteId, reason);
        }
        scheduleNoStreamNoOfferTimeout(remoteId, reason);
      }

      const createdPc = pcsRef.current.get(remoteId) ?? null;
      const ok = isUsablePeerConnection(createdPc);
      console.log(
        `[voice-peer] ensurePeerConnection reason=${reason} remote=${compact} ok=${ok} ` +
          `owner=${isOfferOwner} mode=${mode} pc=${ok}`
      );
      return ok;
    },
    [
      clearReconnectTimer,
      closePeer,
      createPeerConnection,
      deviceId,
      getCurrentConnectionId,
      getReconnectBlockReason,
      isRemoteInCall,
      localAudioTrackRef,
      localStreamRef,
      logEnsureSkipped,
      markConnectStart,
      maybeStartOffer,
      micReady,
      schedulePassiveWaitOfferTimeout,
      scheduleNoStreamNoOfferTimeout,
      assignConnectionId,
      getP2pDirectFailedHoldRemainingMs,
      setPeerState,
      signalReady,
    ]
  );

  ensurePeerConnectionRef.current = ensurePeerConnection;

  const attemptIceRestart = useCallback(
    async (remoteId: string) => {
      if (deviceId >= remoteId) return false;
      if (
        (iceRestartAttemptsRef.current.get(remoteId) ?? 0) >=
        MAX_ICE_RESTART_ATTEMPTS
      ) {
        return false;
      }

      const pc = pcsRef.current.get(remoteId);
      if (!pc || !isUsablePeerConnection(pc)) return false;

      const connectionId = getCurrentConnectionId(remoteId);
      if (!connectionId) return false;

      if (pc.signalingState !== "stable") return false;

      iceRestartAttemptsRef.current.set(remoteId, MAX_ICE_RESTART_ATTEMPTS);

      console.log(
        `[voice-peer] ice-restart remote=${compactDeviceId(remoteId)} ` +
          `reason=checking_stuck_with_live_stream connectionId=${compactConnectionId(connectionId)} ` +
          `conn=${pc.connectionState} ice=${pc.iceConnectionState} ${formatVoiceModeSuffix()}`
      );

      const stats = getOrCreatePeerIceStats(remoteId);
      stats.localTypes.clear();
      stats.localCount = 0;
      stats.gatheringState = "new";

      try {
        const offer = await pc.createOffer({ iceRestart: true });
        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) {
          return false;
        }

        await pc.setLocalDescription(offer);
        await sendSignal(remoteId, "offer", {
          connectionId: activeConnectionId,
          sdp: pc.localDescription,
        });
        offeredPeersRef.current.add(remoteId);
        touchPeerSignal(remoteId, "offer_sent");
        schedulePostIceRestartReconnect(remoteId, connectionId, pc);
        scheduleIceCheckingTimeout(remoteId, connectionId, pc);
        return true;
      } catch (e) {
        console.warn("[call] ice-restart failed", remoteId, e);
        return false;
      }
    },
    [
      deviceId,
      getCurrentConnectionId,
      getOrCreatePeerIceStats,
      scheduleIceCheckingTimeout,
      schedulePostIceRestartReconnect,
      sendSignal,
      touchPeerSignal,
    ]
  );

  const attemptSignalingRecover = useCallback(
    async (remoteId: string, source: string) => {
      const pc = pcsRef.current.get(remoteId);
      if (!pc) return false;

      const media = getPeerMedia(remoteId);
      const conn = pc.connectionState;
      const ice = pc.iceConnectionState;
      const stalled =
        conn === "connecting" ||
        conn === "new" ||
        ice === "checking" ||
        ice === "new";

      if (!stalled) return false;

      const connectionId = getCurrentConnectionId(remoteId);
      const pendingBefore = pendingIceRef.current.get(remoteId)?.length ?? 0;
      const flushResult = await flushPendingIce(remoteId);

      console.log(
        `[voice-peer] signaling-recover remote=${compactDeviceId(remoteId)} source=${source} ` +
          `sig=${pc.signalingState} conn=${conn} ice=${ice} ` +
          `connectionId=${compactConnectionId(connectionId)} ` +
          `pendingIce=${pendingBefore} flushed=${flushResult.flushed} failed=${flushResult.failed} ` +
          `tracks=${media.remoteTracksCount} hasStream=${media.hasRemoteStream} ${formatVoiceModeSuffix()}`
      );

      if (
        pc.signalingState === "have-local-offer" &&
        deviceId < remoteId &&
        !reconnectPendingRef.current.has(remoteId)
      ) {
        ensurePeerConnectionRef.current?.(
          remoteId,
          `signaling_recover_${source}`,
          { force: true }
        );
      }

      return true;
    },
    [deviceId, flushPendingIce, getCurrentConnectionId, getPeerMedia]
  );

  useEffect(() => {
    attemptSignalingRecoverRef.current = attemptSignalingRecover;
  }, [attemptSignalingRecover]);

  useEffect(() => {
    attemptIceRestartRef.current = attemptIceRestart;
  }, [attemptIceRestart]);

  useEffect(() => {
    attemptTurnFallbackForPeerRef.current = attemptTurnFallbackForPeer;
  }, [attemptTurnFallbackForPeer]);

  const scanAndEnsureMissingPcs = useCallback(
    (trigger: string, peers: VoiceMeshPeerSummaryEntry[]) => {
      const missing = peers.filter(
        (peer) => !peer.pcExists && peer.isInCall !== false
      );
      const localTrackState = getLocalTrackReadyState(
        localAudioTrackRef,
        localStreamRef
      );

      if (!micReady || !signalReady || !isLocalTrackLive(localAudioTrackRef, localStreamRef)) {
        console.log(
          `[voice-peer] recoverMissingPcsFromMesh skipped trigger=${trigger} peers=${peers.length} missing=${missing.length} ` +
            `micReady=${micReady} signalReady=${signalReady} localTrack=${localTrackState} ${formatVoiceModeSuffix()}`
        );
        return;
      }

      console.log(
        `[voice-peer] recoverMissingPcsFromMesh start trigger=${trigger} peers=${peers.length} missing=${missing.length} ` +
          `micReady=${micReady} signalReady=${signalReady} localTrack=${localTrackState} ` +
          `missingRemotes=${missing.map((peer) => compactDeviceId(peer.remoteDeviceId)).join(",") || "-"} ` +
          `${formatVoiceModeSuffix()}`
      );

      if (missing.length === 0) {
        console.log(
          `[voice-peer] recoverMissingPcsFromMesh done trigger=${trigger} missing=0`
        );
        return;
      }

      for (const peer of missing) {
        if (logHealSkipP2pTurnDisabledHold(peer.remoteDeviceId)) {
          continue;
        }

        console.log(
          `[voice-peer] recoverMissingPcsFromMesh missing remote=${compactDeviceId(peer.remoteDeviceId)} ` +
            `inCall=${peer.isInCall !== false} pc=false force=true`
        );
        ensurePeerConnection(peer.remoteDeviceId, "mesh_missing_pc", {
          force: true,
        });
      }
    },
    [
      ensurePeerConnection,
      localAudioTrackRef,
      localStreamRef,
      logHealSkipP2pTurnDisabledHold,
      micReady,
      signalReady,
    ]
  );

  scanAndEnsureMissingPcsRef.current = scanAndEnsureMissingPcs;

  useEffect(() => {
    createPeerConnectionRef.current = createPeerConnection;
  }, [createPeerConnection]);

  const logHealPeerAction = useCallback(
    (
      remoteId: string,
      action:
        | "create"
        | "reconnect"
        | "close-extra"
        | "retry-offer"
        | "skip"
        | "deduped",
      reason: string,
      pc: RTCPeerConnection | null | undefined,
      opts?: {
        hasRemoteStream?: boolean;
        healRun?: number;
        scheduledInMs?: number;
      }
    ) => {
      if (action === "skip") {
        voiceDebugLog("[voice-peer] healRun", {
          healRun: opts?.healRun ?? healRunSeqRef.current,
          sessionId,
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          action,
          reason,
          ...(opts?.scheduledInMs != null
            ? { scheduledInMs: opts.scheduledInMs }
            : {}),
        });
        return;
      }

      setPeerMeta(remoteId, {
        lastHealAction:
          action === "deduped"
            ? `deduped:${reason}`
            : `${action}:${reason}`,
      });

      const prev = peerHealActionRef.current.get(remoteId);
      const consecutive =
        prev?.lastAction === action ? prev.consecutive + 1 : 1;

      if (action !== "deduped") {
        peerHealActionRef.current.set(remoteId, {
          lastAction: action,
          consecutive,
        });
      }

      const media = {
        hasRemoteStream:
          opts?.hasRemoteStream ?? remoteStreamsRef.current.has(remoteId),
        remoteTracksCount:
          remoteStreamsRef.current.get(remoteId)?.getAudioTracks().length ?? 0,
      };

      const pending = reconnectPendingRef.current.get(remoteId);

      emitHealPeerAction({
        sessionId,
        localDeviceId: deviceId,
        remoteDeviceId: remoteId,
        healRun: opts?.healRun ?? healRunSeqRef.current,
        action,
        reason,
        pc,
        media,
        scheduledInMs:
          opts?.scheduledInMs ?? pending?.scheduledInMs ?? undefined,
        repeatWarning:
          consecutive >= 3 &&
          (action === "reconnect" || action === "retry-offer"),
      });
    },
    [deviceId, sessionId, setPeerMeta]
  );

  const healPeerConnections = useCallback(() => {
    const buildHealScanPeers = () => {
      const remoteIds = getRemoteIds();
      const peerIds = Array.from(
        new Set([...remoteIds, ...Array.from(pcsRef.current.keys())])
      );
      return peerIds.map((remoteId) => buildMeshPeerSummary(remoteId));
    };

    const runHealScan = (scanTrigger: string) => {
      scanAndEnsureMissingPcsRef.current(scanTrigger, buildHealScanPeers());
    };

    if (!micReady || !signalReady) {
      runHealScan(!micReady ? "healRun_mic_not_ready" : "healRun_signal_not_ready");
      return;
    }

    if (!isLocalTrackLive(localAudioTrackRef, localStreamRef)) {
      console.log(
        `[voice-peer] healPeerConnections skipped micReady=${micReady} localTrack=${getLocalTrackReadyState(localAudioTrackRef, localStreamRef)} ${formatVoiceModeSuffix()}`
      );
      runHealScan("healRun_local_track_not_live");
      return;
    }

    if (voicePolicy.voiceMode === "ios_conservative") {
      const sinceLastHeal = Date.now() - lastHealRunCompletedAtRef.current;
      if (sinceLastHeal < voicePolicy.healIntervalMs) {
        runHealScan("healRun_throttled");
        return;
      }
    }

    const remoteIds = getRemoteIds();

    for (const remoteId of remoteIds) {
      if (hasStaleEndedRemoteAudio(remoteId)) {
        clearEndedRemoteAudio(remoteId);
      }
    }

    type PlannedHeal = {
      remoteId: string;
      action:
        | "create"
        | "reconnect"
        | "close-extra"
        | "retry-offer"
        | "deduped";
      reason: string;
      scheduledInMs?: number;
      run?: () => void;
    };

    const planned: PlannedHeal[] = [];

    for (const existingId of Array.from(pcsRef.current.keys())) {
      if (!remoteIds.includes(existingId)) {
        planned.push({
          remoteId: existingId,
          action: "close-extra",
          reason: "member_left",
          run: () => closePeer(existingId, { clearConnectionId: true, reason: "member_left" }),
        });
      }
    }

    const logHealSkipHealthy = (
      remoteId: string,
      reason: string,
      pc: RTCPeerConnection | null | undefined
    ) => {
      console.log(
        `[voice-peer] heal-skip-healthy target=${compactDeviceId(remoteId)} reason=${reason} ` +
          `conn=${pc?.connectionState ?? "-"} ice=${pc?.iceConnectionState ?? "-"} ` +
          `sig=${pc?.signalingState ?? "-"} ${formatVoiceModeSuffix()}`
      );
    };

    for (const remoteId of remoteIds) {
      if (logHealSkipP2pTurnDisabledHold(remoteId)) {
        continue;
      }

      const pc = pcsRef.current.get(remoteId);

      if (hasStaleEndedRemoteAudio(remoteId)) {
        clearEndedRemoteAudio(remoteId);
        console.log(
          `[voice-peer] heal remote=${compactDeviceId(remoteId)} action=reconnect reason=ended_stream_without_live_track ${formatVoiceModeSuffix()}`
        );
        planned.push({
          remoteId,
          action: "reconnect",
          reason: "ended_stream_without_live_track",
          scheduledInMs: voicePolicy.trackEndedReconnectMs,
          run: () => {
            scheduleReconnect(remoteId, voicePolicy.trackEndedReconnectMs, {
              reason: "ended_stream_without_live_track",
              source: "heal_peer_connections",
              force: true,
            });
          },
        });
        continue;
      }

      const hasStream = hasLiveRemoteAudioStream(remoteId);
      const connected = pc?.connectionState === "connected";
      let blockReason = getReconnectBlockReason(remoteId);
      const media = getPeerMedia(remoteId);
      const offered = offeredPeersRef.current.has(remoteId);
      const noStreamDeadlock = isNoStreamNoOfferDeadlock({
        pc,
        hasLiveRemoteStream: hasStream,
        offered,
        hasRemoteStream: media.hasRemoteStream,
        remoteTracksCount: media.remoteTracksCount,
      });

      if (blockReason === "heal_cooldown" && noStreamDeadlock) {
        console.log(
          `[voice-peer] heal-cooldown-bypass remote=${compactDeviceId(remoteId)} reason=no_stream_no_offer_deadlock ${formatVoiceModeSuffix()}`
        );
        blockReason = null;
      }

      const inCall = isRemoteInCall(remoteId);
      const needsPc = peerNeedsPc(remoteId);
      const transportHealthy = isPeerTransportHealthy(pc);
      const holdCheck = getTrackEndedHoldCheck(remoteId, pc);

      if (hasStream && connected) {
        setPeerState(remoteId, "connected");
        continue;
      }

      if (
        endedHoldTimersRef.current.has(remoteId) ||
        (holdCheck.shouldHold && !hasStream)
      ) {
        logHealSkipHealthy(
          remoteId,
          endedHoldTimersRef.current.has(remoteId)
            ? "track_ended_hold_pending"
            : `track_ended_${holdCheck.reason}`,
          pc
        );
        continue;
      }

      if (needsPc) {
        planned.push({
          remoteId,
          action: "create",
          reason: inCall ? "missing_pc_in_call" : "missing_pc",
          run: () => {
            ensurePeerConnection(
              remoteId,
              inCall ? "heal_missing_pc_in_call" : "heal_missing_pc",
              { force: true }
            );
          },
        });
        continue;
      }

      if (blockReason && pc) {
        planned.push({
          remoteId,
          action: "deduped",
          reason: blockReason,
          scheduledInMs: reconnectPendingRef.current.get(remoteId)?.scheduledInMs,
        });
        continue;
      }

      if (trackEndedAtRef.current.has(remoteId) && !hasStream) {
        if (holdCheck.shouldHold || endedHoldTimersRef.current.has(remoteId)) {
          logHealSkipHealthy(
            remoteId,
            endedHoldTimersRef.current.has(remoteId)
              ? "track_ended_hold_pending"
              : `track_ended_${holdCheck.reason}`,
            pc
          );
          continue;
        }

        planned.push({
          remoteId,
          action: "reconnect",
          reason: "remote_track_ended",
          scheduledInMs: voicePolicy.trackEndedReconnectMs,
          run: () => {
            scheduleReconnect(remoteId, voicePolicy.trackEndedReconnectMs, {
              reason: "heal_remote_track_ended",
              source: "heal_peer_connections",
            });
          },
        });
        continue;
      }

      if (
        hasStream &&
        pc &&
        (pc.connectionState === "disconnected" ||
          pc.iceConnectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.iceConnectionState === "failed" ||
          pc.connectionState === "connecting")
      ) {
        if (transportHealthy) {
          logHealSkipHealthy(remoteId, "stream_without_connected_pc_but_healthy", pc);
          continue;
        }

        const timestamps =
          peerSignalTimestampsRef.current.get(remoteId) ??
          emptyPeerSignalTimestamps();
        const waitCheck = getLiveStreamWaitConnectedCheckForPeer({
          pc,
          hasLiveRemoteStream: hasStream,
          remoteTracksCount: media.remoteTracksCount,
          hasRemoteStream: media.hasRemoteStream,
          timestamps,
          connectStartedAt: connectStartedAtRef.current.get(remoteId),
        });

        if (waitCheck?.shouldHold) {
          console.log(
            `[voice-peer] heal-hold remote=${compactDeviceId(remoteId)} reason=${waitCheck.holdReason ?? "recent_live_stream_wait_connected"} ` +
              `conn=${pc.connectionState} ice=${pc.iceConnectionState} ` +
              `playbackActiveAgeMs=${waitCheck.playbackActiveAgeMs ?? "-"} playAgeMs=${waitCheck.playAgeMs ?? "-"} ` +
              `ontrackAgeMs=${waitCheck.ontrackAgeMs ?? "-"} activityAgeMs=${waitCheck.activityAgeMs ?? "-"} ${formatVoiceModeSuffix()}`
          );
          continue;
        }

        if (waitCheck?.graceExpired) {
          console.log(
            `[voice-peer] heal remote=${compactDeviceId(remoteId)} action=reconnect reason=live_stream_not_connected_timeout ` +
              `conn=${pc.connectionState} ice=${pc.iceConnectionState} ` +
              `activityAgeMs=${waitCheck.activityAgeMs ?? "-"} ${formatVoiceModeSuffix()}`
          );
          planned.push({
            remoteId,
            action: "reconnect",
            reason: "live_stream_not_connected_timeout",
            scheduledInMs: voicePolicy.trackEndedReconnectMs,
            run: () => {
              scheduleReconnect(remoteId, voicePolicy.trackEndedReconnectMs, {
                reason: "heal_live_stream_not_connected_timeout",
                source: "heal_peer_connections",
                force: true,
              });
            },
          });
          continue;
        }

        planned.push({
          remoteId,
          action: "reconnect",
          reason: "stream_without_connected_pc",
          scheduledInMs: voicePolicy.trackEndedReconnectMs,
          run: () => {
            scheduleReconnect(remoteId, voicePolicy.trackEndedReconnectMs, {
              reason: "heal_stream_without_connected_pc",
              source: "heal_peer_connections",
            });
          },
        });
        continue;
      }

      const failed =
        !pc ||
        pc.connectionState === "failed" ||
        pc.iceConnectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected" ||
        pc.iceConnectionState === "disconnected";

      if (failed) {
        if (transportHealthy) {
          logHealSkipHealthy(remoteId, "failed_check_but_transport_healthy", pc);
          continue;
        }

        planned.push({
          remoteId,
          action: "reconnect",
          reason: "pc_failed_or_closed",
          scheduledInMs: voicePolicy.trackEndedReconnectMs,
          run: () => {
            scheduleReconnect(remoteId, voicePolicy.trackEndedReconnectMs, {
              reason: "heal_pc_failed_or_closed",
              source: "heal_peer_connections",
              force: true,
            });
          },
        });
        continue;
      }

      const stuckOffer =
        offeredPeersRef.current.has(remoteId) &&
        !hasStream &&
        pc.signalingState === "have-local-offer";

      if (stuckOffer) {
        const startedAt = connectStartedAtRef.current.get(remoteId) ?? Date.now();
        if (Date.now() - startedAt > 6000) {
          planned.push({
            remoteId,
            action: "retry-offer",
            reason: "stuck_have_local_offer",
            scheduledInMs: voicePolicy.trackEndedReconnectMs,
            run: () => {
              offeredPeersRef.current.delete(remoteId);
              scheduleReconnect(remoteId, voicePolicy.trackEndedReconnectMs, {
                reason: "heal_stuck_have_local_offer",
                source: "heal_peer_connections",
              });
            },
          });
        }
        continue;
      }

      if (!hasStream && !offeredPeersRef.current.has(remoteId)) {
        if (transportHealthy && !noStreamDeadlock) {
          logHealSkipHealthy(remoteId, "no_stream_no_offer_pc_connected", pc);
          continue;
        }

        console.log(
          `[voice-peer] heal remote=${compactDeviceId(remoteId)} action=retry-offer reason=no_stream_no_offer ${formatVoiceModeSuffix()}`
        );

        planned.push({
          remoteId,
          action: pc ? "retry-offer" : "create",
          reason: "no_stream_no_offer",
          run: () => {
            if (!getCurrentConnectionId(remoteId)) {
              assignConnectionId(
                remoteId,
                makeConnectionId(deviceId, remoteId),
                "heal_no_stream_no_offer"
              );
            }
            markConnectStart(remoteId);
            lastHealActionAtRef.current.set(remoteId, Date.now());
            scheduleNoStreamNoOfferTimeout(remoteId, "no_stream_no_offer_heal");

            if (deviceId < remoteId) {
              void startPeerOffer(remoteId, { reason: "no_stream_no_offer" });
            } else if (!isUsablePeerConnection(pcsRef.current.get(remoteId))) {
              ensurePeerConnection(remoteId, "no_stream_no_offer_passive", {
                force: true,
              });
            } else {
              void startPeerOffer(remoteId, {
                force: true,
                reason: "no_stream_no_offer_passive_immediate",
              });
            }
          },
        });
      }
    }

    const actionable = planned.filter((item) => item.action !== "deduped");

    console.log(
      `[voice-peer] heal-plan ${formatVoiceModeSuffix()} ` +
        `actionable=${actionable.map((item) => `${compactDeviceId(item.remoteId)}:${item.action}:${item.reason}`).join("|") || "none"} ` +
        `deduped=${planned.filter((item) => item.action === "deduped").map((item) => `${compactDeviceId(item.remoteId)}:${item.reason}`).join("|") || "none"} ` +
        `scope=${buildPeerScopeSnapshot(pcsRef.current, getPeerMedia)}`
    );

    const runMissingPcSafetyNet = () => {
      for (const remoteId of remoteIds) {
        if (logHealSkipP2pTurnDisabledHold(remoteId)) continue;
        if (!peerNeedsPc(remoteId)) continue;
        ensurePeerConnection(remoteId, "heal_safety_net", { force: true });
      }
    };

    if (actionable.length === 0) {
      if (planned.length > 0) {
        console.log(
          `[voice-peer] heal-all-deduped remotes=${remoteIds.map((id) => compactDeviceId(id)).join(",")} ` +
            `reasons=${planned.map((item) => `${compactDeviceId(item.remoteId)}:${item.reason}`).join("|")}`
        );
        voiceDebugLog("[voice-peer] heal-all-deduped", {
          sessionId,
          deviceId,
          remoteDeviceIds: remoteIds,
          reasons: planned.map((item) => ({
            remoteDeviceId: item.remoteId,
            reason: item.reason,
            scheduledInMs: item.scheduledInMs,
          })),
        });
      }
      runMissingPcSafetyNet();
      runHealScan("healRun");
      emitPeerStates();
      lastHealRunCompletedAtRef.current = Date.now();
      emitMeshSummary("healRun", { immediate: true });
      return;
    }

    healRunSeqRef.current += 1;
    const healRun = healRunSeqRef.current;

    for (const item of planned) {
      if (item.action === "deduped") continue;

      logHealPeerAction(
        item.remoteId,
        item.action,
        item.reason,
        pcsRef.current.get(item.remoteId),
        {
          healRun,
          hasRemoteStream: hasLiveRemoteAudioStream(item.remoteId),
          scheduledInMs: item.scheduledInMs,
        }
      );
      item.run?.();
    }

    for (const item of planned) {
      if (item.action !== "deduped") continue;

      logHealPeerAction(
        item.remoteId,
        item.action,
        item.reason,
        pcsRef.current.get(item.remoteId),
        {
          healRun,
          hasRemoteStream: hasLiveRemoteAudioStream(item.remoteId),
          scheduledInMs: item.scheduledInMs,
        }
      );
    }

    runMissingPcSafetyNet();
    runHealScan("healRun");

    emitPeerStates();

    voiceDebugLog("[voice-peer] healPeerConnections done", {
      healRun,
      sessionId,
      deviceId,
      remoteDeviceIds: remoteIds,
      peerConnectionCount: pcsRef.current.size,
      actionCount: actionable.length,
    });

    emitMeshSummary("healRun", { immediate: true });
    lastHealRunCompletedAtRef.current = Date.now();
  }, [
    buildMeshPeerSummary,
    closePeer,
    deviceId,
    emitMeshSummary,
    emitPeerStates,
    ensurePeerConnection,
    getCurrentConnectionId,
    getReconnectBlockReason,
    getRemoteIds,
    getTrackEndedHoldCheck,
    hasLiveRemoteAudioStream,
    hasStaleEndedRemoteAudio,
    clearEndedRemoteAudio,
    isRemoteInCall,
    localAudioTrackRef,
    localStreamRef,
    logHealPeerAction,
    logHealSkipP2pTurnDisabledHold,
    markConnectStart,
    maybeStartOffer,
    micReady,
    peerNeedsPc,
    scheduleNoStreamNoOfferTimeout,
    scheduleReconnect,
    sessionId,
    assignConnectionId,
    setPeerState,
    signalReady,
    startPeerOffer,
  ]);

  const handleSignal = useCallback(
    async (row: SignalRow) => {
      const signalType = row?.signal_type ?? "unknown";
      const remoteId = row?.from_device_id ?? "";

      if (!row || processedSignalIdsRef.current.has(row.id)) {
        if (row) {
          logVoiceSignalIgnored({
            reason: "duplicate_signal_id",
            type: signalType,
            remote: remoteId,
          });
        }
        return;
      }
      processedSignalIdsRef.current.add(row.id);

      if (row.from_device_id === deviceId) {
        logVoiceSignalIgnored({
          reason: "self_signal",
          type: signalType,
          remote: remoteId,
        });
        return;
      }
      if (row.to_device_id && row.to_device_id !== deviceId) {
        logVoiceSignalIgnored({
          reason: "wrong_target",
          type: signalType,
          remote: remoteId,
        });
        return;
      }
      if (row.session_id !== sessionId) {
        logVoiceSignalIgnored({
          reason: "wrong_session",
          type: signalType,
          remote: remoteId,
        });
        return;
      }

      const payload = row.payload ?? {};

      if (row.signal_type === "reconnect-request") {
        const incomingConnectionId = payload.connectionId;
        if (!incomingConnectionId) {
          logVoiceSignalIgnored({
            reason: "missing_connection_id",
            type: "reconnect-request",
            remote: remoteId,
          });
          return;
        }

        console.log(
          `[voice-signal] reconnect-request-received remote=${compactDeviceId(remoteId)} ` +
            `connectionId=${compactConnectionId(incomingConnectionId)} ${formatVoiceModeSuffix()}`
        );

        await hardResetPeerForManualReconnect(remoteId, {
          resetLogReason: "reconnect_request_received",
        });
        assignConnectionId(
          remoteId,
          incomingConnectionId,
          "reconnect_request_received"
        );
        await beginManualReconnectAfterHardReset(remoteId, {
          skipReconnectRequest: true,
          forceOffer: true,
        });
        return;
      }

      const incomingConnectionId = payload.connectionId;

      if (row.signal_type === "leave") {
        closePeer(remoteId, { clearConnectionId: true, reason: "leave_signal" });
        return;
      }

      if (!incomingConnectionId) {
        logVoiceSignalIgnored({
          reason: "missing_connection_id",
          type: signalType,
          remote: remoteId,
        });
        return;
      }

      let currentConnectionId = getCurrentConnectionId(remoteId);

      const existingPc = pcsRef.current.get(remoteId) ?? null;
      const media = getPeerMedia(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();

      if (row.signal_type === "offer") {
        if (currentConnectionId !== incomingConnectionId) {
          closePeer(remoteId, CLOSE_FOR_RECONNECT);
          assignConnectionId(remoteId, incomingConnectionId, "offer_received");
          connectStartedAtRef.current.set(remoteId, Date.now());
          currentConnectionId = incomingConnectionId;
          offeredPeersRef.current.delete(remoteId);
          startedPeersRef.current.add(remoteId);
        }
      } else if (
        !currentConnectionId ||
        currentConnectionId !== incomingConnectionId
      ) {
        const recoverAction = evaluateStaleSignalRecoverAction({
          signalType,
          pc: existingPc,
          remoteTracksCount: media.remoteTracksCount,
          hasRemoteStream: media.hasRemoteStream,
          confirmedAt: timestamps.lastPlaybackConfirmedAt,
        });

        if (recoverAction === "reject") {
          logVoiceSignalIgnored({
            reason: "stale_connection_id",
            type: signalType,
            remote: remoteId,
            incomingConnectionId,
            currentConnectionId,
            pcExists: !!existingPc,
            sig: existingPc?.signalingState ?? "-",
            conn: existingPc?.connectionState ?? "-",
            ice: existingPc?.iceConnectionState ?? "-",
            hasRemoteStream: media.hasRemoteStream,
            tracks: media.remoteTracksCount,
          });
          return;
        }

        if (signalType === "answer") {
          logVoiceSignalStaleAnswerRecover({
            remote: remoteId,
            incomingConnectionId,
            currentConnectionId,
            action: "accept_or_sync",
          });
        } else {
          logVoiceSignalStaleWarning({
            type: signalType,
            remote: remoteId,
            incomingConnectionId,
            currentConnectionId,
            pcExists: !!existingPc,
            sig: existingPc?.signalingState ?? "-",
            conn: existingPc?.connectionState ?? "-",
            ice: existingPc?.iceConnectionState ?? "-",
            hasRemoteStream: media.hasRemoteStream,
            tracks: media.remoteTracksCount,
          });
        }

        assignConnectionId(
          remoteId,
          incomingConnectionId,
          `stale_${signalType}_recover`
        );
        currentConnectionId = incomingConnectionId;
      }

      const pc = createPeerConnection(remoteId, incomingConnectionId);

      try {
        if (row.signal_type === "offer") {
          const sdp = payload.sdp;
          if (!sdp) {
            logVoiceSignalIgnored({
              reason: "missing_sdp",
              type: "offer",
              remote: remoteId,
            });
            return;
          }

          logVoiceSignalOfferReceived({
            from: row.from_device_id,
            to: row.to_device_id ?? deviceId,
            connectionId: incomingConnectionId,
            currentConnectionId,
            sig: pc.signalingState,
          });

          const isRenegotiation =
            pc.connectionState === "connected" ||
            (pc.connectionState === "connecting" &&
              (pc.iceConnectionState === "checking" ||
                pc.iceConnectionState === "new"));

          if (pc.signalingState !== "stable" && !isRenegotiation) {
            if (pc.signalingState === "have-local-offer") {
              try {
                await pc.setLocalDescription({ type: "rollback" });
              } catch (rollbackErr) {
                console.warn(
                  "[call] offer rollback failed",
                  remoteId,
                  rollbackErr
                );
              }
            } else {
              logVoiceSignalIgnored({
                reason: "invalid_signaling_state",
                type: "offer",
                remote: remoteId,
              });
              return;
            }
          }

          logVoiceSignalSetRemoteOfferStart(remoteId, pc.signalingState);
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          logVoiceSignalSetRemoteOfferDone(remoteId, pc.signalingState);
          await flushPendingIce(remoteId, incomingConnectionId);
          touchPeerSignal(remoteId, "offer_received");

          setPeerState(remoteId, "connecting");

          logVoiceSignalAnswerCreateStart(remoteId);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await sendSignal(remoteId, "answer", {
            connectionId: incomingConnectionId,
            sdp: pc.localDescription,
          });
          logVoiceSignalAnswerSent(remoteId, incomingConnectionId);
          touchPeerSignal(remoteId, "answer_sent");
          emitMeshSummary("answer_sent", { immediate: true });

          return;
        }

        if (row.signal_type === "answer") {
          const sdp = payload.sdp;
          if (!sdp) {
            logVoiceSignalIgnored({
              reason: "missing_sdp",
              type: "answer",
              remote: remoteId,
            });
            return;
          }

          logVoiceSignalAnswerReceived({
            remoteId,
            connectionId: incomingConnectionId,
            currentConnectionId,
            sig: pc.signalingState,
          });

          if (pc.signalingState !== "have-local-offer") {
            logVoiceSignalIgnored({
              reason: "invalid_signaling_state",
              type: "answer",
              remote: remoteId,
            });
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(remoteId, incomingConnectionId);
          touchPeerSignal(remoteId, "answer_received");
          emitMeshSummary("answer_received", { immediate: true });
          return;
        }

        if (row.signal_type === "ice") {
          const candidate = payload.candidate;
          if (!candidate) return;

          const stats = getOrCreatePeerIceStats(remoteId);
          const queued = !pc.remoteDescription;

          logVoiceIceRemoteCandidateReceived({
            remoteId,
            connectionId: incomingConnectionId,
            candidate,
            queued,
          });

          if (queued) {
            recordRemoteIceCandidate(stats, candidate, { queued: true });
            const queue = pendingIceRef.current.get(remoteId) ?? [];
            queue.push(candidate);
            pendingIceRef.current.set(remoteId, queue);
            touchPeerSignal(remoteId, "ice_received");
            emitMeshSummary("ice_received");
            return;
          }

          const added = await addRemoteIceCandidate(
            remoteId,
            pc,
            candidate,
            incomingConnectionId
          );
          if (added) {
            touchPeerSignal(remoteId, "ice_received");
            emitMeshSummary("ice_received");
          }
        }
      } catch (e) {
        console.error("[call] signal handle error", row.signal_type, remoteId, e);

        if (row.signal_type === "offer" || row.signal_type === "answer") {
          closePeer(remoteId, CLOSE_FOR_RECONNECT);
          scheduleReconnect(remoteId, 1200, {
            reason: "signal_handle_error",
            source: "handle_signal",
          });
        }
      }
    },
    [
      addRemoteIceCandidate,
      assignConnectionId,
      beginManualReconnectAfterHardReset,
      closePeer,
      createPeerConnection,
      deviceId,
      emitMeshSummary,
      flushPendingIce,
      getCurrentConnectionId,
      getOrCreatePeerIceStats,
      getPeerMedia,
      hardResetPeerForManualReconnect,
      scheduleReconnect,
      sendSignal,
      sessionId,
      setPeerState,
      touchPeerSignal,
    ]
  );

  useEffect(() => {
    let alive = true;

    async function loadVoiceSettings() {
      try {
        const res = await fetch("/api/voice-settings", {
          cache: "no-store",
        });

        const data = await res.json();

        if (!alive) return;

        const settings = data?.settings;

        if (settings) {
          setTurnFallbackEnabled(settings.turn_fallback_enabled === true);

          if (settings.voice_enabled === false) {
            notifyStatus(settings.emergency_message || "通話機能は停止中です");
          }
        } else {
          setTurnFallbackEnabled(false);
        }
      } catch {
        setTurnFallbackEnabled(false);
      }
    }

    void loadVoiceSettings();

    return () => {
      alive = false;
    };
  }, [notifyStatus]);

  useEffect(() => {
    const track = localAudioTrackRef.current;
    if (!track) return;

    track.enabled = true;

    for (const pc of pcsRef.current.values()) {
      const sender = pc
        .getSenders()
        .find((s) => s.track?.kind === "audio" || s.track === null);

      if (sender) {
        void sender.replaceTrack(isMuted ? null : track);
      }
    }
  }, [isMuted, localAudioTrackRef]);

  useEffect(() => {
    const remoteIds = getRemoteIds();

    voiceDebugLog("[voice-peer] offer effect check", {
      micReady,
      signalReady,
      remoteIds,
      membersCount: members.length,
      os: osRef.current,
      voiceRoute: voiceRouteRef.current,
      members: members.map((m) => ({
        device_id: m.device_id,
        is_in_call: m.is_in_call,
      })),
    });

    if (!micReady) {
      voiceDebugLog("[voice-peer] offer effect stop", { reason: "micReady_false" });
      return;
    }

    if (!signalReady) {
      voiceDebugLog("[voice-peer] offer effect stop", {
        reason: "signalReady_false",
      });
      return;
    }

    if (!isLocalTrackLive(localAudioTrackRef, localStreamRef)) {
      voiceDebugLog("[voice-peer] offer effect stop", {
        reason: "local_track_not_live",
        localTrack: getLocalTrackReadyState(localAudioTrackRef, localStreamRef),
      });
      return;
    }

    if (remoteIds.length < 1) {
      voiceDebugLog("[voice-peer] offer effect stop", { reason: "no_remoteIds" });
      return;
    }

    for (const existingId of Array.from(pcsRef.current.keys())) {
      if (!remoteIds.includes(existingId)) {
        startedPeersRef.current.delete(existingId);
        peerStatesRef.current.delete(existingId);
        emitPeerStates();
        closePeer(existingId, { clearConnectionId: true, reason: "member_removed" });
      }
    }

    for (const remoteId of remoteIds) {
      if (!getCurrentConnectionId(remoteId)) {
        assignConnectionId(
          remoteId,
          makeConnectionId(deviceId, remoteId),
          "member_join"
        );
      }

      void maybeStartOffer(remoteId);
    }

    healPeerConnections();
    emitMeshSummary("after_join", { immediate: true });
  }, [
    members,
    micReady,
    signalReady,
    deviceId,
    assignConnectionId,
    closePeer,
    emitMeshSummary,
    emitPeerStates,
    getCurrentConnectionId,
    getRemoteIds,
    healPeerConnections,
    maybeStartOffer,
  ]);

  useEffect(() => {
    if (!micReady) return;
    if (!signalReady) return;

    const timer = window.setInterval(() => {
      healPeerConnections();
    }, voicePolicy.healIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [micReady, signalReady, healPeerConnections]);

  useEffect(() => {
    if (membersSyncRevision <= 0) return;
    if (!micReady || !isLocalTrackLive(localAudioTrackRef, localStreamRef)) return;
    healPeerConnections();
    emitMeshSummary("members_updated", { immediate: true });
  }, [
    membersSyncRevision,
    emitMeshSummary,
    healPeerConnections,
    localAudioTrackRef,
    localStreamRef,
    micReady,
  ]);

  const performVoicePeerCleanup = useCallback(
    (reason: VoicePeerCleanupReason, logTag: VoicePeerCleanupLogTag) => {
      const pcCount = pcsRef.current.size;
      let timerCount = 0;

      for (const timer of reconnectTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      reconnectTimersRef.current.clear();
      reconnectPendingRef.current.clear();

      for (const timer of endedHoldTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      endedHoldTimersRef.current.clear();

      for (const timer of noStreamNoOfferTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      noStreamNoOfferTimersRef.current.clear();

      for (const timer of passiveWaitOfferTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      passiveWaitOfferTimersRef.current.clear();

      for (const timer of iceCheckingTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      iceCheckingTimersRef.current.clear();

      for (const timer of connectingTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      connectingTimersRef.current.clear();

      if (meshSummaryTimerRef.current) {
        window.clearTimeout(meshSummaryTimerRef.current);
        meshSummaryTimerRef.current = null;
        timerCount += 1;
      }
      if (meshNotConnectedTimerRef.current) {
        window.clearTimeout(meshNotConnectedTimerRef.current);
        meshNotConnectedTimerRef.current = null;
        timerCount += 1;
      }

      const remoteAudioCount = remoteStreamsRef.current.size;

      for (const [, pc] of Array.from(pcsRef.current.entries())) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.oniceconnectionstatechange = null;
          pc.onsignalingstatechange = null;
          pc.onicegatheringstatechange = null;
          pc.close();
        } catch {}
      }

      pcsRef.current.clear();
      remoteStreamsRef.current.clear();
      pendingIceRef.current.clear();
      connectionIdsRef.current.clear();
      offeredPeersRef.current.clear();
      startedPeersRef.current.clear();
      processedSignalIdsRef.current.clear();
      connectStartedAtRef.current.clear();
      loggedConnectedRef.current.clear();
      peerSnapshotRef.current.clear();
      peerEverConnectedRef.current.clear();
      peerLastConnectedAtRef.current.clear();
      recoveryStartedAtRef.current.clear();
      attachedTrackIdsRef.current.clear();
      trackEndedAtRef.current.clear();
      peerHealActionRef.current.clear();
      lastHealActionAtRef.current.clear();
      peerSignalTimestampsRef.current.clear();
      peerMetaRef.current.clear();
      peerStatesRef.current.clear();

      setRemoteAudios({});
      emitPeerStatesRef.current();
      onVoiceCleanupRef.current?.();

      console.log(
        `[voice-peer] ${logTag} reason=${reason} pcs=${pcCount} timers=${timerCount} remoteAudios=${remoteAudioCount} ${formatVoiceModeSuffix()}`
      );
    },
    []
  );

  useEffect(() => {
    const effectSessionId = sessionId;
    const effectDeviceId = deviceId;

    return () => {
      const nextSessionId = sessionIdRef.current;
      const nextDeviceId = deviceIdRef.current;

      let reason: VoicePeerCleanupReason = "component_unmount";
      if (nextSessionId !== effectSessionId) {
        reason = "session_changed";
      } else if (nextDeviceId !== effectDeviceId) {
        reason = "device_changed";
      }

      performVoicePeerCleanup(reason, "cleanup-on-unmount");
    };
  }, [deviceId, performVoicePeerCleanup, sessionId]);

  useEffect(() => {
    if (!micReady || !signalReady) return;

    const timer = window.setInterval(() => {
      const remoteIds = getRemoteIds();
      let hasStuckPeer = false;

      for (const remoteId of remoteIds) {
        const pc = pcsRef.current.get(remoteId);
        if (!pc) continue;
        if (pc.connectionState === "connected") continue;

        const startedAt = connectStartedAtRef.current.get(remoteId);
        if (startedAt != null && Date.now() - startedAt >= 10000) {
          hasStuckPeer = true;
          break;
        }
      }

      if (hasStuckPeer) {
        emitMeshSummary("not_connected_10s", { immediate: true });
      }
    }, 10000);

    meshNotConnectedTimerRef.current = timer;

    return () => {
      window.clearInterval(timer);
      meshNotConnectedTimerRef.current = null;
    };
  }, [emitMeshSummary, getRemoteIds, micReady, signalReady]);

  useEffect(() => {
    return () => {
      if (meshSummaryTimerRef.current) {
        window.clearTimeout(meshSummaryTimerRef.current);
      }
      if (meshNotConnectedTimerRef.current) {
        window.clearInterval(meshNotConnectedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        healPeerConnections();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [healPeerConnections]);

  useEffect(() => {
    if (!micReady) return;
    if (!signalReady && !pcsRef.current.size) return;

    const timer = window.setInterval(() => {
      const remoteIds = getRemoteIds();

      for (const remoteId of remoteIds) {
        const hasRemoteStream = hasLiveRemoteAudioStream(remoteId);
        const pc = pcsRef.current.get(remoteId);

        if (hasRemoteStream) continue;
        if (!pc) continue;

        const badState =
          pc.connectionState === "failed" ||
          pc.iceConnectionState === "failed" ||
          pc.connectionState === "disconnected" ||
          pc.iceConnectionState === "disconnected";

        if (badState) {
          scheduleReconnect(remoteId, 1200, {
            reason: "transport_bad_state",
            source: "peer_transport_watchdog",
          });
        }
      }
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [members, micReady, signalReady, deviceId, scheduleReconnect, getRemoteIds]);

  return {
    remoteAudios,
    handleSignal,
    handleRemotePlaybackHealthChange,
    handlePlaybackUnconfirmedTimeout,
    manualPeerHardReset,
  };
}