"use client";

import {
  debugConsoleLog,
  debugConsoleInfo,
  voiceProdLog,
  voiceProdLogUntilDeadline,
} from "@/lib/debugVoiceLog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SendSignalResult,
  SignalPayload,
  SignalRow,
  SignalType,
} from "./useCallSignaling";
import {
  checkVoiceMeshExpectations,
  compactDeviceId,
  logHealPeerAction as emitHealPeerAction,
  logVoicePeerAutoRecover,
  logHealRecoverySuccess,
  logPeerStateChange,
  logPeerStateWarning,
  logRemoteTrackEvent,
  logVoiceMeshPeerSummary,
  logVoiceSignalAnswerReceived,
  logVoiceSignalAnswerSent,
  logVoiceSignalIgnored,
  logVoiceSignalOfferReceived,
  logVoiceSignalSetRemoteOfferDone,
  logVoiceSignalStaleAnswerRecover,
  logVoiceSignalStaleWarning,
  logVoicePeerPair,
  logVoicePeerRole,
  logVoiceSettingsReadyChange,
  logVoiceStartBlocked,
  logVoiceStartCheck,
  logVoiceAudioConfirmTimer,
  logVoiceEnsureRepeat,
  logVoiceEnsureSkipped,
  logPassiveOfferDeferred,
  logPassiveWaitCancel,
  logVoiceGlare,
  logVoiceGlareAcceptRemoteOffer,
  logVoiceGlareRollbackDone,
  logVoiceGlareRollbackStart,
  logVoiceNegotiationGap,
  logVoicePeerCompetition,
  logVoiceRemoteTrackReceived,
  markVoiceNegotiationStep,
  mapEnsureSkipToVoiceStartBlocked,
  resetVoiceNegotiationSteps,
  compactConnectionId,
  voiceDebugLog,
  type VoiceMeshPeerSummaryEntry,
  type PeerStatusDiagnostics,
  type VoiceStartBlockedReason,
} from "./voiceDiagnostics";
import { recordCallReloadContext } from "@/lib/callReloadDiagnostics";
import { isDocumentHidden } from "@/lib/appLifecycle";
import {
  formatVoiceModeSuffix,
  getVoiceModePolicy,
  logVoiceClientEnv,
} from "@/lib/voiceClientEnv";
import type { RemotePlaybackHealth } from "./RemoteAudio";
import {
  buildVoicePlaybackBlockReason,
  logVoiceReconnectDecision,
  type VoiceReconnectDecisionInput,
} from "@/lib/voiceReconnectDiagnostics";
import {
  evaluateIceDisconnectedReconnectSuppressReason,
  ICE_DISCONNECTED_RECONNECT_GRACE_MS,
  PC_DISCONNECTED_RECONNECT_GRACE_MS,
  classifyTransportDisconnect,
  isIceTransportReconnectReason,
  isPeerIceDisconnectedOnly,
  isPeerPcDisconnectedOnly,
  type IceDisconnectedGuardInput,
  type IceDisconnectedSuppressReason,
} from "@/lib/voiceIceDisconnectedGuard";
import { shouldRejectEstablishedPeerStaleOffer } from "@/lib/voiceStaleOfferGuard";
import {
  makeStableConnectionId,
  resolveOfferConnectionConflict,
} from "@/lib/voiceOfferGlareGuard";
import { buildVoiceConnectionMembersFingerprint } from "@/lib/memberListEquality";
import {
  classifyPeerNegotiationPhase,
  shouldSuppressPassiveOfferReschedule,
  type PeerNegotiationPhase,
} from "@/lib/voicePeerNegotiationPhase";
import {
  evaluateVoicePeerMutationBlock,
  getEstablishedPeerAutoRecoverySkipReason,
  shouldProtectVoicePeerFromAutoMutation,
  type VoicePlaybackEstablishedEvidence,
} from "@/lib/voicePlaybackEstablishedGuard";
import type { VoiceAudioConfirmCancelReason } from "@/app/call/voice/voiceDiagnostics";

type VoicePeerCreateOpts = {
  caller: string;
  reason?: string;
  force?: boolean;
};

const PRESERVE_REMOTE_AUDIO_WINDOW_MS = 12_000;
import { applyUserMutedToTrack } from "@/lib/localMicMuteState";
import { normalizeVoiceTransportSettings } from "@/lib/voiceTransportMode";
import { fetchWithRetry } from "@/lib/retryableFetch";
import {
  ANSWER_WAIT_TIMEOUT_MS,
  CONNECTED_AUDIO_CONFIRM_PLAYBACK_GRACE_MS,
  HAVE_LOCAL_OFFER_STUCK_MS,
  NO_STREAM_NO_OFFER_FORCE_MS,
  PASSIVE_WAIT_OFFER_INITIAL_MS,
  PASSIVE_WAIT_OFFER_MIC_READY_MS,
  PASSIVE_WAIT_OFFER_TIMEOUT_MS,
  VOICE_JOIN_STABILIZATION_MS,
  getConnectedAudioConfirmTimeoutMs,
  getConnectingTurnProbeMs,
  getP2pCheckingGraceMs,
} from "@/lib/voiceJoinTiming";
import {
  evaluateVoiceSoftResetTrigger,
  isBidirectionalAudioEstablished,
  MAX_VOICE_SOFT_RESET_ATTEMPTS,
  shouldBlockVoiceSoftReset,
  type VoiceSoftResetTriggerReason,
} from "@/lib/voiceSoftReset";
import {
  buildVoiceConnectionLogSnapshot,
  formatVoiceFailureConnectionState,
  logVoicePerfPipeline,
  logVoicePipelineClassification,
  markVoicePeerClose,
  classifyVoicePipelineFailure,
  getPeerPipelineMarks,
  markVoicePerf,
  resetVoicePeerMarks,
} from "@/lib/voicePerf";
import {
  AUDIO_DIAG_LOG_THROTTLE_MS,
  AUDIO_STATS_POLL_INTERVAL_MS,
  AUDIO_STRICT_CONFIRM_TIMEOUT_MS,
  classifyOneWayAudioSubClass,
  collectPeerRtpStats,
  formatVoiceConnectedConnectionState,
  getPeerInboundDeltaBytes,
  getPeerOutboundDeltaBytes,
  logLocalAudioSenderCheck,
  logVoiceOneWayAudioSubClass,
  logVoiceRtpStats,
  resetPeerAudioDiagnostics,
  type OneWayAudioSubClass,
  type PeerRtpStatsSnapshot,
  type VoiceConnectedAudioState,
} from "@/lib/voiceAudioDiagnostics";
import {
  getSessionMemberRemoteDeviceIds,
  isLocalVoiceParticipant,
} from "@/lib/voiceSessionMembers";
import {
  createRemotePeerGraceRefs,
  getClosePeerEvidence,
  getRemoteIdsWithMemberGrace,
  isPresenceConfirmedRemoteLeave,
  markRemotePeerExplicitRemoved,
  shouldCloseRemotePeerNow,
} from "@/lib/callRemotePeerGrace";
import {
  isExplicitPeerCloseReason,
  isStableVoiceJoinMode,
  stableCloseRequiresEvidence,
} from "@/lib/stableVoiceJoin";
import {
  getCachedTurnIceServers,
  getCachedTurnProvider,
  getCachedVoiceTransport,
  resetSessionVoiceCache,
  setCachedTurnIceServers,
  setCachedVoiceTransport,
} from "@/lib/sessionVoiceCache";
import {
  purgeVoicePeerPairCacheForRemote,
  registerVoicePeerPairBuilder,
  resetVoicePeerPairRegistry,
  updateVoicePeerPairCache,
  type VoicePeerPairSnapshot,
} from "@/lib/voicePeerPairRegistry";
import {
  detectSignalingAsymmetry,
  enrichPeerVoiceClass,
  getVoicePeerPairDiag,
  resetVoicePeerPairDiag,
  updateVoicePeerPairDiag,
} from "@/lib/voicePeerPairDiagnostics";
import {
  isPeerP2pEstablished,
  isPeerTransportUnconfirmed,
  isTransportMediaConnected,
} from "@/lib/memberPresenceStatus";
import {
  createEmptyPeerIceDiagnostics,
  evaluateInsufficientRemoteCandidates,
  hasNoRelayCandidates,
  logVoiceIceAddCandidateFailed,
  logVoiceIceP2pDirectFailed,
  logVoiceIceAddCandidateSuccess,
  logVoiceIceCandidatePairFromPc,
  logVoiceIceCheckingStuck,
  type VoiceIceCandidatePairSnapshot,
  logVoiceIceGatheringComplete,
  logVoiceIceGatheringState,
  logVoiceIceInsufficientCandidates,
  logVoiceIceCandidateIgnored,
  logVoiceIceCandidateSent,
  logVoiceIceLocalCandidate,
  logVoiceIceRemoteCandidateReceived,
  recordLocalIceCandidate,
  recordRemoteIceCandidate,
  type PeerIceDiagnostics,
} from "./voiceIceDiagnostics";
import {
  hasTurnIceServer,
  resolveIceTransportPolicy,
  resolvePeerIceTransportPolicy,
} from "@/lib/voiceRoute";

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

function isReceiveOnlyMutedSession(
  releaseMicOnMute: boolean,
  userMutedRef: React.MutableRefObject<boolean>
): boolean {
  return releaseMicOnMute && userMutedRef.current;
}

function canEnsurePeerWithoutLocalTrack(
  isOfferOwner: boolean,
  releaseMicOnMute: boolean,
  userMutedRef: React.MutableRefObject<boolean>
): boolean {
  if (!isOfferOwner) return true;
  return isReceiveOnlyMutedSession(releaseMicOnMute, userMutedRef);
}

function hasPassiveRemoteNeedingPc(
  deviceId: string,
  remoteIds: string[],
  peerNeedsPc: (remoteId: string) => boolean
): boolean {
  const selfId = String(deviceId ?? "").trim();
  return remoteIds.some(
    (remoteId) =>
      selfId > remoteId && peerNeedsPc(remoteId)
  );
}

function logVoicePeerReplaceTrack(
  remoteId: string,
  track: MediaStreamTrack | null,
  reason: string
) {
  debugConsoleLog(
    `[voice-peer] replace-track remote=${compactDeviceId(remoteId)} ` +
      `track=${track?.readyState === "live" ? "live" : "null"} reason=${reason}`
  );
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
  userMuted: boolean;
  userMutedRef: React.MutableRefObject<boolean>;
  micReady: boolean;
  micPermissionDeniedRef: React.MutableRefObject<boolean>;
  signalReady: boolean;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  localAudioTrackRef: React.MutableRefObject<MediaStreamTrack | null>;
  sendSignal: (
    toDeviceId: string | null,
    signalType: SignalType,
    payload: SignalPayload
  ) => Promise<SendSignalResult>;
  onRemoteCountChange?: (count: number) => void;
  onStatusChange?: (text: string) => void;
  onPeerStatesChange?: (states: Record<string, PeerState>) => void;
  onPeerDiagnosticsChange?: (
    diagnostics: Record<string, PeerStatusDiagnostics>
  ) => void;
  onVoiceCleanup?: () => void;
  onReadinessSnapshot?: (snapshot: {
    remoteIds: string[];
    settingsReady: boolean;
    signalReady: boolean;
    turnReady: boolean;
    voiceEnabled: boolean;
    awaitingAnswerPeerIds: string[];
    anyAwaitingAnswer: boolean;
  }) => void;
  onSoftResetExhausted?: (remoteId: string, reason: VoiceSoftResetTriggerReason) => void;
  voiceLayerInstanceId?: string;
};

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

const AUDIO_CONFIRM_REARM_DEDUPE_MS = 5000;
const VOICE_START_CHECK_LOG_DEDUPE_MS = 5000;
const PEER_DIAGNOSTICS_EMIT_MIN_INTERVAL_MS = 1000;

const voicePolicy = getVoiceModePolicy();
logVoiceClientEnv("peer-connections-init");

const MESH_SUMMARY_DEBOUNCE_MS = 150;
const TRACK_ENDED_HOLD_MS = 2000;
const TRACK_ENDED_RECENT_CONNECTED_MS = 5000;
const LIVE_STREAM_WAIT_CONNECTED_MS = 10000;
const PLAYBACK_ACTIVE_HOLD_MS = 15000;
const MAX_P2P_NO_RELAY_RETRY_ATTEMPTS = 3;
const P2P_NO_RELAY_RETRY_FOLLOWUP_MS = 3000;
const P2P_BACKGROUND_RETRY_INTERVAL_MS = 30_000;
const P2P_BACKGROUND_RECONNECT_EVERY_N_CYCLES = 2;

function getIceCheckingDiagnosticsMs(memberCount: number): number {
  return getP2pCheckingGraceMs(memberCount);
}
const ICE_RESTART_STUCK_MS = 15000;
const ICE_RESTART_POST_TIMEOUT_MS = 10000;
const MAX_ICE_RESTART_ATTEMPTS = 1;
const P2P_DIRECT_FAILED_HOLD_MS = 60_000;
const ORPHAN_REMOTE_AUDIO_MS = 15000;
const AUTO_HARD_RESET_MIN_INTERVAL_MS = 30_000;
const AUTO_HARD_RESET_MAX_ATTEMPTS = 3;
const AUTO_HARD_RESET_CONFIRMED_HOLD_MS = 10_000;
const AUTO_HARD_RESET_STUCK_MS = 15_000;
const AUTO_HARD_RESET_ORPHAN_MS = 5_000;
const AUTO_HARD_RESET_P2P_FAILED_WINDOW_MS = 5_000;
const AUTO_HARD_RESET_EVAL_INTERVAL_MS = 2_000;
const RECONNECT_REQUEST_RETRY_MS = 5_000;
const SOFT_REBUILD_ICE_UNCONFIRMED_MS = 17_000;
const SOFT_REBUILD_MIN_INTERVAL_MS = 25_000;
const MAX_SOFT_ICE_RESTART_ATTEMPTS = 2;

type PeerHardResetMode = "manual" | "auto";

type PassiveReconnectState = {
  connectionId: string;
  reconnectReason: string;
  sentAt: number | null;
  retryUsed: boolean;
  retryTimerId: number | null;
  hardResetAt: number;
};

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

function hasActivePlaybackWithoutConfirmation(
  timestamps: PeerSignalTimestamps
): boolean {
  return (
    timestamps.lastPlaybackConfirmedAt == null &&
    (timestamps.lastPlaySuccessAt != null ||
      timestamps.lastPlaybackActiveAt != null)
  );
}

function getSoftRebuildStuckSinceMs(params: {
  timestamps: PeerSignalTimestamps;
  connectStartedAt: number | null | undefined;
  checkingStuckSince: number | null | undefined;
}): number | null {
  const anchors = [
    params.checkingStuckSince ?? null,
    params.connectStartedAt ?? null,
    params.timestamps.lastPlaybackActiveAt,
    params.timestamps.lastPlaySuccessAt,
    params.timestamps.lastOnTrackAt,
  ].filter((value): value is number => value != null);

  if (!anchors.length) return null;
  return Math.min(...anchors);
}

function evaluateAutoHardResetTrigger(params: {
  pc: RTCPeerConnection | null;
  timestamps: PeerSignalTimestamps;
  hasRemoteStream: boolean;
  hasPc: boolean;
  isOrphan: boolean;
  orphanSince: number | null;
  connectStartedAt: number | null;
  p2pDirectFailedAt: number | null;
  nowMs: number;
  awaitingRemoteAnswer?: boolean;
}): string | null {
  const { timestamps, nowMs } = params;
  const conn = params.pc?.connectionState ?? "-";
  const ice = params.pc?.iceConnectionState ?? "-";
  const sig = params.pc?.signalingState ?? "-";

  if (params.awaitingRemoteAnswer) {
    return null;
  }

  if (
    sig === "have-local-offer" &&
    conn !== "connected" &&
    ice !== "connected" &&
    ice !== "completed"
  ) {
    return null;
  }

  if (conn === "failed" || ice === "failed") {
    return "transport_failed";
  }

  if (
    params.p2pDirectFailedAt != null &&
    nowMs - params.p2pDirectFailedAt <= AUTO_HARD_RESET_P2P_FAILED_WINDOW_MS
  ) {
    return "p2p_direct_failed";
  }

  if (
    params.isOrphan ||
    (!params.hasPc && params.hasRemoteStream)
  ) {
    if (
      params.orphanSince != null &&
      nowMs - params.orphanSince >= AUTO_HARD_RESET_ORPHAN_MS
    ) {
      return "orphan_remote_audio_provisional";
    }
  }

  const connectAgeMs =
    params.connectStartedAt != null
      ? nowMs - params.connectStartedAt
      : null;
  const isConnectingChecking =
    conn === "connecting" || ice === "checking" || ice === "new";

  if (hasActivePlaybackWithoutConfirmation(timestamps) && isConnectingChecking) {
    return null;
  }

  if (
    isConnectingChecking &&
    connectAgeMs != null &&
    connectAgeMs >= AUTO_HARD_RESET_STUCK_MS
  ) {
    return "connecting_checking_stuck";
  }

  if (timestamps.lastPlaybackConfirmedAt == null) {
    const anchor =
      params.connectStartedAt ??
      timestamps.lastOnTrackAt ??
      timestamps.lastPlaybackActiveAt;
    if (
      anchor != null &&
      nowMs - anchor >= AUTO_HARD_RESET_STUCK_MS &&
      !hasActivePlaybackWithoutConfirmation(timestamps)
    ) {
      return "confirmed_at_missing";
    }
  }

  if (
    timestamps.lastPlaybackActiveAt != null &&
    timestamps.lastPlaybackConfirmedAt == null &&
    nowMs - timestamps.lastPlaybackActiveAt >= AUTO_HARD_RESET_STUCK_MS &&
    !isConnectingChecking
  ) {
    return "playback_provisional_unconfirmed";
  }

  return null;
}

function isAutoHardResetConfirmedHold(timestamps: PeerSignalTimestamps): boolean {
  const confirmedAt = timestamps.lastPlaybackConfirmedAt;
  return (
    confirmedAt != null &&
    Date.now() - confirmedAt < AUTO_HARD_RESET_CONFIRMED_HOLD_MS
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
  debugConsoleLog(
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

const HEAL_STUCK_OFFER_RECONNECT_MS = 2500;

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

function isVoiceJoinTransportReady(input: {
  signalReady: boolean;
  settingsReady: boolean;
  voiceTransportDisabled: boolean;
  relayForced: boolean;
  iceServers: RTCIceServer[];
}): boolean {
  if (!input.signalReady || !input.settingsReady) return false;
  if (input.voiceTransportDisabled) return false;
  if (input.relayForced && !hasTurnIceServer(input.iceServers)) return false;
  return true;
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
  userMuted,
  userMutedRef,
  micReady,
  micPermissionDeniedRef,
  signalReady,
  localStreamRef,
  localAudioTrackRef,
  sendSignal,
  onRemoteCountChange,
  onStatusChange,
  onPeerStatesChange,
  onPeerDiagnosticsChange,
  onVoiceCleanup,
  onReadinessSnapshot,
  onSoftResetExhausted,
  voiceLayerInstanceId = "-",
}: UsePeerConnectionsArgs) {
  const sessionIdRef = useRef(sessionId);
  const deviceIdRef = useRef(deviceId);
  const membersCountRef = useRef(members.length);
  const membersRef = useRef(members);
  membersRef.current = members;
  const remotePeerGraceRefsRef = useRef(createRemotePeerGraceRefs());
  const voiceSessionMemberIdsRef = useRef<Set<string>>(new Set());
  const lastPeerCloseReasonRef = useRef<Map<string, string>>(new Map());
  const deferredMemberCloseTimersRef = useRef<Map<string, number>>(new Map());
  const onVoiceCleanupRef = useRef(onVoiceCleanup);
  const onSoftResetExhaustedRef = useRef(onSoftResetExhausted);
  const emitPeerStatesRef = useRef<() => void>(() => {});

  sessionIdRef.current = sessionId;
  deviceIdRef.current = deviceId;
  resetSessionVoiceCache(sessionId);

  useEffect(() => {
    voiceSessionMemberIdsRef.current.clear();
    lastPeerCloseReasonRef.current.clear();
    voiceJoinEpochRef.current = { sessionId, startedAt: 0 };
    passiveFallbackOfferByConnRef.current.clear();
    passiveWaitOfferMetaRef.current.clear();
    activeOfferJoinLoggedRef.current.clear();
    softResetAttemptCountRef.current.clear();
    softResetLastAtRef.current.clear();
    softResetExhaustedNotifiedRef.current.clear();
    bidirectionalEstablishedRef.current.clear();
    peerAutoRecoveryFrozenRef.current.clear();
    if (deferredHealTimerRef.current != null) {
      window.clearTimeout(deferredHealTimerRef.current);
      deferredHealTimerRef.current = null;
    }
  }, [sessionId]);

  const inCallMemberCount = useMemo(() => {
    if (isStableVoiceJoinMode()) {
      return Math.max(1, members.length || 1);
    }
    const inCallIds = members
      .filter((m) => m.is_in_call === true)
      .map((m) => String(m.device_id ?? "").trim())
      .filter(Boolean);
    return Math.max(1, inCallIds.length || members.length || 1);
  }, [members]);
  onVoiceCleanupRef.current = onVoiceCleanup;
  onSoftResetExhaustedRef.current = onSoftResetExhausted;

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
    ((
      remoteId: string,
      connectionId: string,
      opts?: VoicePeerCreateOpts
    ) => RTCPeerConnection | null) | null
  >(null);
  const healPeerConnectionsRef = useRef<() => void>(() => {});
  const ensurePeerConnectionRef = useRef<
    ((
      remoteId: string,
      reason: string,
      opts?: EnsurePeerConnectionOpts
    ) => boolean) | null
  >((remoteId, reason) => {
    debugConsoleLog(
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
    debugConsoleLog(
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
  const loggedAudioStrictRef = useRef<Set<string>>(new Set());
  const refreshConnectedVoiceLogForAudioStrictRef = useRef<
    (remoteId: string, source: string) => void
  >(() => {});
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
  const iceDisconnectedGraceTimersRef = useRef<Map<string, number>>(new Map());
  const pcDisconnectedGraceTimersRef = useRef<Map<string, number>>(new Map());
  const connectingTimersRef = useRef<Map<string, number>>(new Map());
  const attachedTrackIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const trackEndedAtRef = useRef<Map<string, number>>(new Map());
  const endedHoldTimersRef = useRef<Map<string, number>>(new Map());
  const answerWaitTimersRef = useRef<Map<string, number>>(new Map());
  const answerWaitMetaRef = useRef<
    Map<string, { connectionId: string; reason: string; armedAt: number }>
  >(new Map());
  const answerWaitRetriedByConnRef = useRef<Map<string, string>>(new Map());
  const clearAnswerWaitTimerRef = useRef<
    (remoteId: string, cancelReason?: string, caller?: string) => void
  >(() => {});
  const passiveWaitOfferTimersRef = useRef<Map<string, number>>(new Map());
  const passiveFallbackOfferByConnRef = useRef<Map<string, string>>(new Map());
  const passiveWaitOfferMetaRef = useRef<
    Map<string, { triggerReason: string; scheduledAt: number; delayMs: number }>
  >(new Map());
  const activeOfferJoinLoggedRef = useRef<Set<string>>(new Set());
  const softResetAttemptCountRef = useRef<Map<string, number>>(new Map());
  const softResetLastAtRef = useRef<Map<string, number>>(new Map());
  const softResetExhaustedNotifiedRef = useRef<Set<string>>(new Set());
  const bidirectionalEstablishedRef = useRef<Set<string>>(new Set());
  /** Sticky latch: auto heal/reconnect/passive-wait forbidden until manual reset. */
  const peerAutoRecoveryFrozenRef = useRef<
    Map<string, "audio_confirmed_strict" | "playback_evidence">
  >(new Map());
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
  const ensurePeerAttemptRef = useRef<Map<string, number>>(new Map());

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
  const armConnectedAudioConfirmRef = useRef<
    (remoteId: string, triggerReason: string) => void
  >(() => {});
  const audioReplayAtRef = useRef<Map<string, number>>(new Map());
  const audioUnconfirmedTimeoutNotifiedRef = useRef<Set<string>>(new Set());
  const peerIceDiagnosticsRef = useRef<Map<string, PeerIceDiagnostics>>(new Map());
  const peerIcePolicyRef = useRef<Map<string, RTCIceTransportPolicy>>(new Map());
  const oneWayAudioLoggedRef = useRef<Set<string>>(new Set());
  const peerIceConnectedAtRef = useRef<Map<string, number>>(new Map());
  const audioDiagLogAtRef = useRef<Map<string, number>>(new Map());
  const audioStrictRecoveryAttemptedRef = useRef<Set<string>>(new Set());
  const iceRestartAttemptsRef = useRef<Map<string, number>>(new Map());
  const checkingPlaybackStuckAtRef = useRef<Map<string, number>>(new Map());
  const softRenegotiateLastAtRef = useRef<Map<string, number>>(new Map());
  const softIceRestartAttemptsRef = useRef<Map<string, number>>(new Map());
  const softRebuildCandidateLoggedRef = useRef<Set<string>>(new Set());
  const iceRestartPostTimersRef = useRef<Map<string, number>>(new Map());
  const turnFallbackAttemptedRef = useRef<Map<string, boolean>>(new Map());
  const p2pDirectFailedHoldUntilRef = useRef<Map<string, number>>(new Map());
  const manualHardResetHealPassRef = useRef<Set<string>>(new Set());
  const autoHardResetLastAtRef = useRef<Map<string, number>>(new Map());
  const autoHardResetAttemptCountRef = useRef<Map<string, number>>(new Map());
  const autoHardResetGiveUpRef = useRef<Set<string>>(new Set());
  const autoHardResetInProgressRef = useRef<Set<string>>(new Set());
  const p2pDirectFailedSignalAtRef = useRef<Map<string, number>>(new Map());
  const passiveReconnectStateRef = useRef<Map<string, PassiveReconnectState>>(
    new Map()
  );
  const orphanRemoteAudioAtRef = useRef<Map<string, number>>(new Map());
  const orphanRemoteAudioRef = useRef<Set<string>>(new Set());
  const orphanRemoteAudioLoggedRef = useRef<Set<string>>(new Set());
  const [turnFallbackEnabled, setTurnFallbackEnabled] = useState(false);
  const turnFallbackEnabledRef = useRef(false);
  const p2pEnabledRef = useRef(true);
  const relayForcedRef = useRef(false);
  const voiceTransportDisabledRef = useRef(false);
  const connectedAudioConfirmTimersRef = useRef<Map<string, number>>(
    new Map()
  );
  const connectedAudioConfirmArmedAtRef = useRef<Map<string, number>>(
    new Map()
  );
  const voiceStartCheckLastLogRef = useRef<
    Map<string, { atMs: number; blockedReason: string }>
  >(new Map());
  const passiveJoinSettledRef = useRef<Set<string>>(new Set());
  const healSkipHealthyLastLogRef = useRef(
    new Map<string, { reason: string; atMs: number }>()
  );
  const offerEffectMembersFingerprintRef = useRef("");
  const lastPeerDiagnosticsEmitRef = useRef<{ signature: string; atMs: number }>({
    signature: "",
    atMs: 0,
  });
  const getPeerNegotiationPhaseRef = useRef<
    (remoteId: string, pc?: RTCPeerConnection | null) => PeerNegotiationPhase
  >(() => "none");
  const connectedAudioConfirmGraceRef = useRef<Map<string, number>>(new Map());
  const voiceJoinEpochRef = useRef<{ sessionId: string; startedAt: number }>({
    sessionId: "",
    startedAt: 0,
  });
  const deferredHealTimerRef = useRef<number | null>(null);
  const turnProviderRef = useRef<string | null>(null);
  const remotePlaybackHealthRef = useRef(
    new Map<string, RemotePlaybackHealth>()
  );
  const preserveRemoteAudioUntilRef = useRef(new Map<string, number>());
  const voiceSettingsReadyRef = useRef(false);
  const signalReadyRef = useRef(false);
  const voiceSettingsScopeRef = useRef("");
  const [settingsReadyTick, setSettingsReadyTick] = useState(0);
  const [turnReadyTick, setTurnReadyTick] = useState(0);

  const bumpTurnReadyTick = useCallback((reason: string) => {
    setTurnReadyTick((tick) => tick + 1);
    debugConsoleLog(`[turn] ready-tick reason=${reason}`);
  }, []);

  const applyVoiceSettingsReady = useCallback(
    (next: boolean, reason: string) => {
      const prev = voiceSettingsReadyRef.current;
      if (prev === next) return false;
      voiceSettingsReadyRef.current = next;
      logVoiceSettingsReadyChange({
        from: prev,
        to: next,
        reason,
        sessionId,
        deviceId,
      });
      setSettingsReadyTick((tick) => tick + 1);
      return true;
    },
    [deviceId, sessionId]
  );

  useEffect(() => {
    signalReadyRef.current = signalReady;
  }, [signalReady]);
  const onReadinessSnapshotRef = useRef(onReadinessSnapshot);
  onReadinessSnapshotRef.current = onReadinessSnapshot;

  const getPeerIceTransportPolicy = useCallback((): RTCIceTransportPolicy => {
    return resolvePeerIceTransportPolicy({
      p2pEnabled: p2pEnabledRef.current,
      staticTurnEnabled: turnFallbackEnabledRef.current,
      voiceRouteTurn: voiceRouteRef.current === "turn",
    });
  }, []);

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

      debugConsoleLog(
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

  const clearAnswerWaitTimer = useCallback(
    (remoteId: string, cancelReason?: string, caller = "unknown") => {
      const timer = answerWaitTimersRef.current.get(remoteId);
      if (timer) {
        window.clearTimeout(timer);
        answerWaitTimersRef.current.delete(remoteId);
      }
      const meta = answerWaitMetaRef.current.get(remoteId);
      if (cancelReason && meta) {
        const elapsedMs = Date.now() - meta.armedAt;
        const pc = pcsRef.current.get(remoteId) ?? null;
        voiceProdLog(
          `[voice-signal] answer_wait_cancel remote=${compactDeviceId(remoteId)} ` +
            `reason=${cancelReason} caller=${caller} ` +
            `connectionId=${compactConnectionId(meta.connectionId)} ` +
            `currentConnectionId=${compactConnectionId(connectionIdsRef.current.get(remoteId))} ` +
            `elapsedMs=${elapsedMs} sig=${pc?.signalingState ?? "-"} ` +
            `conn=${pc?.connectionState ?? "-"} ice=${pc?.iceConnectionState ?? "-"} ` +
            `offerReason=${meta.reason}`
        );
      }
      answerWaitMetaRef.current.delete(remoteId);
    },
    []
  );

  useEffect(() => {
    clearAnswerWaitTimerRef.current = clearAnswerWaitTimer;
  }, [clearAnswerWaitTimer]);

  const cancelPassiveWaitOffer = useCallback(
    (remoteId: string, reason: string) => {
      const hadTimer = passiveWaitOfferTimersRef.current.has(remoteId);
      clearPassiveWaitOfferTimer(remoteId);
      passiveWaitOfferMetaRef.current.delete(remoteId);
      if (hadTimer) {
        logPassiveWaitCancel({ remoteId, reason });
      }
    },
    [clearPassiveWaitOfferTimer]
  );

  const clearIceDisconnectedGraceTimer = useCallback((remoteId: string) => {
    const timer = iceDisconnectedGraceTimersRef.current.get(remoteId);
    if (timer) {
      window.clearTimeout(timer);
      iceDisconnectedGraceTimersRef.current.delete(remoteId);
    }
  }, []);

  const clearPcDisconnectedGraceTimer = useCallback((remoteId: string) => {
    const timer = pcDisconnectedGraceTimersRef.current.get(remoteId);
    if (timer) {
      window.clearTimeout(timer);
      pcDisconnectedGraceTimersRef.current.delete(remoteId);
    }
  }, []);

  const clearPeerWatchdogTimers = useCallback((remoteId: string) => {
    clearPassiveWaitOfferTimer(remoteId);
    clearNoStreamNoOfferTimer(remoteId);
    clearIceDisconnectedGraceTimer(remoteId);
    clearPcDisconnectedGraceTimer(remoteId);

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
  }, [
    clearIceDisconnectedGraceTimer,
    clearPcDisconnectedGraceTimer,
    clearNoStreamNoOfferTimer,
    clearPassiveWaitOfferTimer,
  ]);

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

      debugConsoleLog(
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
      debugConsoleLog(
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

        debugConsoleLog(
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

  useEffect(() => {
    if (!isStableVoiceJoinMode()) return;
    const selfId = String(deviceId ?? "").trim();
    for (const member of members) {
      const id = String(member.device_id ?? "").trim();
      if (!id || id === selfId) continue;
      if (remotePeerGraceRefsRef.current.explicitRemoved.has(id)) continue;
      voiceSessionMemberIdsRef.current.add(id);
    }
  }, [members, deviceId, membersSyncRevision]);

  const getSessionMemberRemoteIds = useCallback(() => {
    const selfId = String(deviceId ?? "").trim();
    let fromMembers = getSessionMemberRemoteDeviceIds(activeMembers, selfId);
    if (
      fromMembers.length === 0 &&
      members.length > 1 &&
      isStableVoiceJoinMode()
    ) {
      fromMembers = getSessionMemberRemoteDeviceIds(members, selfId);
      if (fromMembers.length > 0) {
        debugConsoleLog(
          `[voice-peer] remoteIds-rebuild session=${sessionId.slice(-6)} ` +
            `members=${members.length} rebuilt=${fromMembers.length}`
        );
        for (const id of fromMembers) {
          voiceSessionMemberIdsRef.current.add(id);
        }
      }
    }
    if (!isStableVoiceJoinMode()) return fromMembers;

    const merged = new Set(fromMembers);
    for (const id of voiceSessionMemberIdsRef.current) {
      if (!id || id === selfId) continue;
      if (remotePeerGraceRefsRef.current.explicitRemoved.has(id)) continue;
      merged.add(id);
    }
    return Array.from(merged);
  }, [activeMembers, deviceId, members, sessionId]);

  const getStrictRemoteIds = useCallback(() => {
    if (isStableVoiceJoinMode()) {
      return getSessionMemberRemoteIds();
    }
    const selfId = String(deviceId ?? "").trim();
    return activeMembers
      .filter((m) => m.is_in_call === true)
      .map((m) => String(m.device_id ?? "").trim())
      .filter((id) => id && id !== selfId);
  }, [activeMembers, deviceId, getSessionMemberRemoteIds]);

  const getRemoteIds = useCallback(() => {
    const strict = getStrictRemoteIds();
    const sessionMemberIds = isStableVoiceJoinMode()
      ? getSessionMemberRemoteIds()
      : undefined;
    const { ids } = getRemoteIdsWithMemberGrace(
      strict,
      remotePeerGraceRefsRef.current,
      Date.now(),
      sessionMemberIds
    );
    return ids;
  }, [getSessionMemberRemoteIds, getStrictRemoteIds]);

  const emitReadinessSnapshot = useCallback(
    (reason: string) => {
      const remoteIds = getRemoteIds();
      const turnReady =
        !relayForcedRef.current || hasTurnIceServer(iceServersRef.current);
      const awaitingAnswerPeerIds = remoteIds.filter((remoteId) => {
        const meta = answerWaitMetaRef.current.get(remoteId) ?? null;
        const armed =
          answerWaitTimersRef.current.has(remoteId) || meta != null;
        const marks = getPeerPipelineMarks(remoteId);
        const pc = pcsRef.current.get(remoteId) ?? null;
        return (
          armed &&
          !marks.answer_received &&
          (pc?.signalingState === "have-local-offer" || marks.offer_sent)
        );
      });
      const snapshot = {
        remoteIds,
        settingsReady: voiceSettingsReadyRef.current,
        signalReady,
        turnReady,
        voiceEnabled: !voiceTransportDisabledRef.current,
        awaitingAnswerPeerIds,
        anyAwaitingAnswer: awaitingAnswerPeerIds.length > 0,
      };
      onReadinessSnapshotRef.current?.(snapshot);
      debugConsoleLog(
        `[voice-peer] readiness reason=${reason} remoteIds=${remoteIds.length} ` +
          `settingsReady=${snapshot.settingsReady ? 1 : 0} signalReady=${snapshot.signalReady ? 1 : 0} ` +
          `turnReady=${snapshot.turnReady ? 1 : 0} voiceEnabled=${snapshot.voiceEnabled ? 1 : 0} ` +
          `awaitingAnswer=${snapshot.anyAwaitingAnswer ? 1 : 0} ` +
          `turnWaitMs=${snapshot.turnReady ? 0 : "pending"}`
      );
    },
    [getRemoteIds, signalReady]
  );

  const hookRunIdRef = useRef(0);
  const lastHookStartLogKeyRef = useRef("");

  useEffect(() => {
    const key = [
      voiceLayerInstanceId,
      sessionId,
      deviceId,
      micReady ? 1 : 0,
      signalReady ? 1 : 0,
      voiceSettingsReadyRef.current ? 1 : 0,
    ].join("|");
    if (lastHookStartLogKeyRef.current === key) return;
    lastHookStartLogKeyRef.current = key;
    hookRunIdRef.current += 1;
    debugConsoleLog(
      `[voice-peer] hook-start instance=${voiceLayerInstanceId} runId=${hookRunIdRef.current} ` +
        `session=${sessionId.slice(-6)} device=${compactDeviceId(deviceId)} ` +
        `micReady=${micReady ? 1 : 0} signalReady=${signalReady ? 1 : 0} ` +
        `settingsReady=${voiceSettingsReadyRef.current ? 1 : 0} members=${members.length}`
    );
    emitReadinessSnapshot("hook_start");
  }, [
    deviceId,
    emitReadinessSnapshot,
    micReady,
    members.length,
    sessionId,
    signalReady,
    settingsReadyTick,
    voiceLayerInstanceId,
  ]);

  const clearDeferredMemberCloseTimer = useCallback((remoteId: string) => {
    const timer = deferredMemberCloseTimersRef.current.get(remoteId);
    if (timer != null) {
      window.clearTimeout(timer);
      deferredMemberCloseTimersRef.current.delete(remoteId);
    }
  }, []);

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
      if (event === "offer_received") {
        const passiveState = passiveReconnectStateRef.current.get(remoteId);
        if (passiveState?.retryTimerId != null) {
          window.clearTimeout(passiveState.retryTimerId);
        }
        passiveReconnectStateRef.current.delete(remoteId);
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
        autoHardResetAttemptCountRef.current.delete(remoteId);
        autoHardResetGiveUpRef.current.delete(remoteId);
        p2pDirectFailedSignalAtRef.current.delete(remoteId);
      }

      peerSignalTimestampsRef.current.set(remoteId, next);

      if (
        event === "offer_received" ||
        event === "answer_sent" ||
        event === "answer_received" ||
        event === "ice_sent" ||
        event === "ice_received"
      ) {
        markVoicePerf(event, { remoteId });
      }
    },
    []
  );

  const markIceTransportConfirmed = useCallback(
    (remoteId: string, pc: RTCPeerConnection) => {
      const conn = pc.connectionState;
      const ice = pc.iceConnectionState;
      if (!isTransportMediaConnected(conn, ice)) return;

      softRebuildCandidateLoggedRef.current.delete(remoteId);
      checkingPlaybackStuckAtRef.current.delete(remoteId);
      softIceRestartAttemptsRef.current.delete(remoteId);

      const recordedPair = p2pNoRelaySelectedPairRef.current.get(remoteId);
      const stats = peerIceDiagnosticsRef.current.get(remoteId);
      const route =
        recordedPair?.route ??
        (voiceRouteRef.current === "turn" ||
        stats?.localTypes.has("relay") ||
        stats?.remoteTypes.has("relay")
          ? "turn"
          : "p2p");

      const relayModeSuffix = relayForcedRef.current
        ? " mode=relay_forced"
        : "";

      debugConsoleLog(
        `[voice-peer] ice-confirmed remote=${compactDeviceId(remoteId)} ` +
          `route=${route} conn=${conn} ice=${ice} ` +
          `localType=${recordedPair?.localType ?? "-"} ` +
          `remoteType=${recordedPair?.remoteType ?? "-"} ` +
          `networkType=${recordedPair?.networkType ?? "-"}${relayModeSuffix} ${formatVoiceModeSuffix()}`
      );

      if (relayForcedRef.current && route === "p2p") {
        debugConsoleLog(
          `[voice-peer] policy-violation remote=${compactDeviceId(remoteId)} ` +
            `policy=relay localType=${recordedPair?.localType ?? "-"} route=p2p`
        );
      }
      if (
        relayForcedRef.current &&
        recordedPair?.localType &&
        recordedPair.localType !== "relay"
      ) {
        debugConsoleLog(
          `[voice-peer] policy-violation remote=${compactDeviceId(remoteId)} ` +
            `policy=relay localType=${recordedPair.localType} route=${route}`
        );
      }
    },
    []
  );

  const classifyPeerAudioSubClass = useCallback(
    (
      remoteId: string,
      opts?: {
        stats?: PeerRtpStatsSnapshot | null;
        health?: RemotePlaybackHealth | null;
        playbackStrict?: boolean;
        remoteTrackReceived?: boolean;
      }
    ): OneWayAudioSubClass => {
      const marks = getPeerPipelineMarks(remoteId);
      const health =
        opts?.health ?? remotePlaybackHealthRef.current.get(remoteId) ?? null;
      const media = getPeerMedia(remoteId);
      const pc = pcsRef.current.get(remoteId);
      const iceConnected =
        pc != null &&
        isTransportMediaConnected(pc.connectionState, pc.iceConnectionState);
      const localTrack = getLocalAudioTrack(localAudioTrackRef, localStreamRef);
      const sender = pc?.getSenders().find((s) => s.track?.kind === "audio");
      const receiveOnly = isReceiveOnlyMutedSession(
        voicePolicy.releaseMicOnMute,
        userMutedRef
      );
      const localSenderExpected =
        micReady &&
        (isLocalTrackLive(localAudioTrackRef, localStreamRef) || receiveOnly);
      const trackOk =
        opts?.remoteTrackReceived ??
        (marks.remote_track_received || media.remoteTracksCount > 0);
      const playbackStrict =
        opts?.playbackStrict ??
        (marks.audio_confirmed_strict || health?.audioConfirmedStrict === true);

      return classifyOneWayAudioSubClass({
        iceConnected,
        remoteTrackReceived: trackOk,
        inboundDeltaBytes:
          opts?.stats?.deltaInboundBytes ?? getPeerInboundDeltaBytes(remoteId),
        inboundDeltaPackets: opts?.stats?.deltaInboundPackets ?? 0,
        inboundBytesTotal: opts?.stats?.inboundBytes,
        hasRtpBaseline: opts?.stats?.hadRtpBaseline,
        playSuccess: health?.playSuccess === true,
        playFailed: health?.playFailedAt != null,
        playbackStrict,
        currentTimeAdvanced: health?.currentTimeAdvanced === true,
        playbackUnconfirmed:
          health?.playSuccess === true && !playbackStrict,
        level: health?.level ?? 0,
        outboundDeltaBytes:
          opts?.stats?.deltaOutboundBytes ?? getPeerOutboundDeltaBytes(remoteId),
        senderTrackReadyState:
          sender?.track?.readyState ?? localTrack?.readyState ?? "none",
        senderTrackMuted: sender?.track?.muted ?? localTrack?.muted ?? false,
        senderTrackEnabled:
          sender?.track?.enabled ?? localTrack?.enabled ?? false,
        localSenderExpected,
      });
    },
    [
      getPeerMedia,
      localAudioTrackRef,
      localStreamRef,
      micReady,
      userMutedRef,
      voicePolicy.releaseMicOnMute,
    ]
  );

  const publishPeerAudioSubClass = useCallback(
    (
      remoteId: string,
      subClass: OneWayAudioSubClass,
      stats: PeerRtpStatsSnapshot | null,
      health: RemotePlaybackHealth | null
    ) => {
      if (subClass === "OK") return;

      const media = getPeerMedia(remoteId);
      const marks = getPeerPipelineMarks(remoteId);
      const trackOk =
        marks.remote_track_received || media.remoteTracksCount > 0;

      updateVoicePeerPairDiag(
        remoteId,
        {
          subClass,
          inboundDeltaBytes:
            stats?.deltaInboundBytes ?? getPeerInboundDeltaBytes(remoteId),
          outboundDeltaBytes:
            stats?.deltaOutboundBytes ?? getPeerOutboundDeltaBytes(remoteId),
          trackLive: trackOk,
          currentTimeAdvanced: health?.currentTimeAdvanced === true,
          paused: health?.playSuccess === true && !health?.audioConfirmedStrict,
        },
        connectionIdsRef.current.get(remoteId) ?? null
      );

      const logKey = `${remoteId}:${subClass}`;
      if (!oneWayAudioLoggedRef.current.has(logKey)) {
        oneWayAudioLoggedRef.current.add(logKey);
        logVoiceOneWayAudioSubClass({
          remoteDeviceId: remoteId,
          subClass,
          iceConnected: true,
          remoteTrackReceived: trackOk,
          audioConfirmedStrict: false,
          inboundDeltaBytes:
            stats?.deltaInboundBytes ?? getPeerInboundDeltaBytes(remoteId),
          outboundDeltaBytes:
            stats?.deltaOutboundBytes ?? getPeerOutboundDeltaBytes(remoteId),
          currentTimeAdvanced: health?.currentTimeAdvanced === true,
          paused: health?.playSuccess === true && !health?.audioConfirmedStrict,
          trackLive: trackOk,
          playFailed: health?.playFailedAt != null,
        });
      }
    },
    [getPeerMedia]
  );

  const buildVoiceConnectedAudioState = useCallback(
    (
      remoteId: string,
      route: string,
      stats?: PeerRtpStatsSnapshot | null
    ): VoiceConnectedAudioState => {
      const marks = getPeerPipelineMarks(remoteId);
      const health = remotePlaybackHealthRef.current.get(remoteId);
      const media = getPeerMedia(remoteId);
      const pc = pcsRef.current.get(remoteId);
      const iceOk =
        pc != null &&
        isTransportMediaConnected(pc.connectionState, pc.iceConnectionState);
      const trackOk =
        marks.remote_track_received || media.remoteTracksCount > 0;
      const strict = marks.audio_confirmed_strict || health?.audioConfirmedStrict;
      const provisional = !strict && (marks.audio_provisional || health?.playSuccess);
      const playback = strict
        ? "strict"
        : provisional
          ? "provisional"
          : health?.playFailedAt != null
            ? "failed"
            : "pending";
      const audio = strict
        ? "strict"
        : provisional
          ? "provisional"
          : health?.playFailedAt != null
            ? "failed"
            : "pending";

      let subClass: OneWayAudioSubClass | null = null;
      if (!strict && iceOk) {
        const classified = classifyPeerAudioSubClass(remoteId, {
          stats: stats ?? null,
          health: health ?? null,
          playbackStrict: strict,
          remoteTrackReceived: trackOk,
        });
        subClass = classified !== "OK" ? classified : null;
      }

      return {
        route,
        iceOk,
        trackOk,
        playback,
        audio,
        subClass,
        oneWay: subClass != null,
      };
    },
    [classifyPeerAudioSubClass, getPeerMedia, localAudioTrackRef, localStreamRef]
  );

  const attemptPeerAudioStrictRecovery = useCallback(
    async (
      remoteId: string,
      subClass: OneWayAudioSubClass,
      stats: PeerRtpStatsSnapshot
    ) => {
      if (audioStrictRecoveryAttemptedRef.current.has(remoteId)) return;
      audioStrictRecoveryAttemptedRef.current.add(remoteId);

      debugConsoleLog(
        `[voice-peer] audio-strict-recovery remote=${compactDeviceId(remoteId)} sub=${subClass} ` +
          `inboundDelta=${stats.deltaInboundBytes} outboundDelta=${stats.deltaOutboundBytes} ${formatVoiceModeSuffix()}`
      );

      if (
        subClass === "D3" ||
        (stats.deltaInboundBytes > 0 &&
          !getPeerPipelineMarks(remoteId).audio_confirmed_strict)
      ) {
        if (!remoteAudiosRef.current[remoteId]) {
          ensureRemoteAudioMountedRef.current(remoteId, "audio_strict_mount");
        }
        triggerRemoteAudioReplayRef.current(remoteId, "audio_strict_reattach");
        return;
      }

      if (subClass === "D5") {
        const pc = pcsRef.current.get(remoteId);
        const track = getLocalAudioTrack(localAudioTrackRef, localStreamRef);
        const sender = pc?.getSenders().find((s) => s.track?.kind === "audio");
        if (sender && track) {
          await sender.replaceTrack(userMutedRef.current ? null : track);
        }
        return;
      }

      if (subClass === "D4") {
        triggerRemoteAudioReplayRef.current(remoteId, "audio_strict_play_retry");
        return;
      }

      void maybeSoftRenegotiatePeerRef
        .current(remoteId)
        .then((softOk) => {
          if (softOk) return;
          return attemptSignalingRecoverRef.current(
            remoteId,
            `audio_strict_${subClass}`
          );
        });
    },
    [localAudioTrackRef, localStreamRef, userMutedRef]
  );

  const pollPeerAudioDiagnostics = useCallback(
    async (remoteId: string) => {
      const pc = pcsRef.current.get(remoteId);
      if (!pc || !isUsablePeerConnection(pc)) return;
      if (
        !isTransportMediaConnected(pc.connectionState, pc.iceConnectionState)
      ) {
        return;
      }

      const stats = await collectPeerRtpStats(pc, remoteId);
      const now = Date.now();
      const marks = getPeerPipelineMarks(remoteId);
      const health = remotePlaybackHealthRef.current.get(remoteId) ?? null;
      const subClass = marks.audio_confirmed_strict
        ? ("OK" as OneWayAudioSubClass)
        : classifyPeerAudioSubClass(remoteId, { stats, health });

      const lastLog = audioDiagLogAtRef.current.get(remoteId) ?? 0;
      const shouldLog = now - lastLog >= AUDIO_DIAG_LOG_THROTTLE_MS;
      if (shouldLog) {
        audioDiagLogAtRef.current.set(remoteId, now);
        const pendingSub = subClass !== "OK" ? subClass : null;
        logVoiceRtpStats({
          remoteId,
          direction: "inbound",
          packets: stats.inboundPackets,
          bytes: stats.inboundBytes,
          deltaBytes: stats.deltaInboundBytes,
          deltaPackets: stats.deltaInboundPackets,
          audioLevel: stats.inboundAudioLevel,
          subClass: pendingSub,
        });
        logVoiceRtpStats({
          remoteId,
          direction: "outbound",
          packets: stats.outboundPackets,
          bytes: stats.outboundBytes,
          deltaBytes: stats.deltaOutboundBytes,
          deltaPackets: stats.deltaOutboundPackets,
        });

        const localTrack = getLocalAudioTrack(localAudioTrackRef, localStreamRef);
        const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
        logLocalAudioSenderCheck({
          remoteId,
          localTrackReadyState: localTrack?.readyState ?? "none",
          localTrackMuted: localTrack?.muted ?? false,
          localTrackEnabled: localTrack?.enabled ?? false,
          senderTrackReadyState: sender?.track?.readyState ?? "none",
          senderTrackEnabled: sender?.track?.enabled ?? false,
          senderTrackMuted: sender?.track?.muted ?? false,
          bytesSent: stats.outboundBytes,
          packetsSent: stats.outboundPackets,
          deltaBytesSent: stats.deltaOutboundBytes,
          deltaPacketsSent: stats.deltaOutboundPackets,
          subClass: pendingSub,
        });
      }

      if (health?.audioConfirmedStrict && !marks.audio_confirmed_strict) {
        touchPeerSignal(remoteId, "playback_confirmed");
        markVoicePerf("audio_confirmed_strict", { remoteId });
        markVoicePerf("audio_confirmed", { remoteId });
        markPeerAutoRecoveryFrozenRef.current(
          remoteId,
          "audio_confirmed_strict"
        );
        logVoicePerfPipeline(`remote=${compactDeviceId(remoteId)} source=stats_poll`);
      }

      if (
        marks.audio_confirmed_strict ||
        health?.audioConfirmedStrict === true
      ) {
        refreshConnectedVoiceLogForAudioStrictRef.current(
          remoteId,
          "stats_poll"
        );
      }

      if (!marks.audio_confirmed_strict && subClass !== "OK") {
        publishPeerAudioSubClass(remoteId, subClass, stats, health);

        const iceConnectedAt = peerIceConnectedAtRef.current.get(remoteId);
        if (
          iceConnectedAt != null &&
          now - iceConnectedAt >= AUDIO_STRICT_CONFIRM_TIMEOUT_MS
        ) {
          void attemptPeerAudioStrictRecovery(remoteId, subClass, stats);
        }
      }
    },
    [
      attemptPeerAudioStrictRecovery,
      classifyPeerAudioSubClass,
      localAudioTrackRef,
      localStreamRef,
      publishPeerAudioSubClass,
      touchPeerSignal,
    ]
  );

  const handleRemotePlaybackHealthChange = useCallback(
    (remoteId: string, health: RemotePlaybackHealth) => {
      remotePlaybackHealthRef.current.set(remoteId, health);

      if (health.playSuccessEvent) {
        touchPeerSignal(remoteId, "play_success");
        markVoicePerf("audio_play_success", { remoteId });
      }

      if (health.playSuccess && !health.audioConfirmedStrict) {
        markVoicePerf("audio_provisional", { remoteId });
        touchPeerSignal(remoteId, "playback_active");
      }

      if (health.audioConfirmedStrict) {
        bidirectionalEstablishedRef.current.add(remoteId);
        touchPeerSignal(remoteId, "playback_confirmed");
        markVoicePerf("audio_confirmed_strict", { remoteId });
        markVoicePerf("audio_confirmed", { remoteId });
        cancelPassiveWaitOffer(remoteId, "audio_confirmed_strict");
        markPeerAutoRecoveryFrozenRef.current(
          remoteId,
          "audio_confirmed_strict"
        );
        logVoicePerfPipeline(`remote=${compactDeviceId(remoteId)}`);
        refreshConnectedVoiceLogForAudioStrictRef.current(
          remoteId,
          "remote_playback_health"
        );
        connectedAudioConfirmGraceRef.current.delete(remoteId);
        const confirmTimer =
          connectedAudioConfirmTimersRef.current.get(remoteId);
        if (confirmTimer) {
          window.clearTimeout(confirmTimer);
          connectedAudioConfirmTimersRef.current.delete(remoteId);
          connectedAudioConfirmArmedAtRef.current.delete(remoteId);
          logVoiceAudioConfirmTimer({
            remoteId,
            phase: "cancel",
            reason: "already_confirmed",
            sig: pcsRef.current.get(remoteId)?.signalingState,
            conn: pcsRef.current.get(remoteId)?.connectionState,
            ice: pcsRef.current.get(remoteId)?.iceConnectionState,
          });
        }
        oneWayAudioLoggedRef.current.forEach((key) => {
          if (key.startsWith(`${remoteId}:`)) {
            oneWayAudioLoggedRef.current.delete(key);
          }
        });
      } else if (
        health.playSuccess ||
        health.playbackActive ||
        (health.level ?? 0) > 0.001
      ) {
        voiceProdLog(
          `[voice-peer] playback_evidence remote=${compactDeviceId(remoteId)} ` +
            `playSuccess=${health.playSuccess ? 1 : 0} playbackActive=${health.playbackActive ? 1 : 0} ` +
            `level=${(health.level ?? 0).toFixed(3)}`
        );
        cancelPassiveWaitOffer(remoteId, "playback_evidence");
        markPeerAutoRecoveryFrozenRef.current(remoteId, "playback_evidence");
      } else if (health.playbackActive) {
        markVoicePerf("playback_advanced", { remoteId });
        debugConsoleLog(
          `[voice-peer] playback-active remote=${compactDeviceId(remoteId)} ageMs=0 source=remote_audio ` +
            `mode=${health.playbackActiveMode} strict=0 ${formatVoiceModeSuffix()}`
        );
      }

      if (!health.audioConfirmedStrict) {
        const pc = pcsRef.current.get(remoteId);
        const iceConnected =
          pc != null &&
          isTransportMediaConnected(pc.connectionState, pc.iceConnectionState);
        if (iceConnected) {
          const subClass = classifyPeerAudioSubClass(remoteId, { health });
          if (subClass !== "OK") {
            publishPeerAudioSubClass(remoteId, subClass, null, health);
          }
        }
      }
    },
    [
      cancelPassiveWaitOffer,
      classifyPeerAudioSubClass,
      publishPeerAudioSubClass,
      touchPeerSignal,
    ]
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

    debugConsoleLog(
      `[voice-peer] audio-unconfirmed-timeout remote=${compactDeviceId(remoteId)} ` +
        `confirmedAt=- playAt=${playAt} playbackAt=${playbackAt} attempts=3 ${formatVoiceModeSuffix()}`
    );

    const pc = pcsRef.current.get(remoteId);
    const marks = getPeerPipelineMarks(remoteId);
    const iceConnected =
      pc != null &&
      (pc.iceConnectionState === "connected" ||
        pc.iceConnectionState === "completed");
    if (iceConnected && !marks.audio_confirmed_strict) {
      const health = remotePlaybackHealthRef.current.get(remoteId) ?? null;
      const subClass = classifyPeerAudioSubClass(remoteId, { health });
      if (subClass !== "OK") {
        publishPeerAudioSubClass(remoteId, subClass, null, health);
      }
    }

    void maybeSoftRenegotiatePeerRef
      .current(remoteId)
      .then((softOk) => {
        if (softOk) return;
        return attemptSignalingRecoverRef.current(
          remoteId,
          "audio_playback_unconfirmed_timeout"
        );
      })
      .finally(() => {
        const timestamps =
          peerSignalTimestampsRef.current.get(remoteId) ??
          emptyPeerSignalTimestamps();
        if (timestamps.lastPlaybackConfirmedAt != null) return;
        if (reconnectPendingRef.current.has(remoteId)) return;
        const playbackHealth = remotePlaybackHealthRef.current.get(remoteId);
        if (
          playbackHealth?.audioConfirmedStrict === true &&
          hasLiveRemoteAudioStream(remoteId)
        ) {
          return;
        }
        const pc = pcsRef.current.get(remoteId);
        if (
          p2pEnabledRef.current &&
          turnFallbackEnabledRef.current &&
          voiceRouteRef.current === "stun" &&
          pc &&
          isTransportMediaConnected(pc.connectionState, pc.iceConnectionState) &&
          timestamps.lastPlaybackConfirmedAt == null
        ) {
          void attemptTurnFallbackForPeerRef.current(
            remoteId,
            "connected_no_actual_audio"
          );
          return;
        }
        scheduleReconnectRef.current?.(remoteId, 1200, {
          reason: "audio_playback_unconfirmed_timeout",
          source: "audio_playback_unconfirmed_timeout",
          force: true,
        });
      });
  }, [
    classifyPeerAudioSubClass,
    hasLiveRemoteAudioStream,
    publishPeerAudioSubClass,
  ]);

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
        isInCall: isStableVoiceJoinMode()
          ? !!member
          : member?.is_in_call === true,
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

  const buildPeerPairSnapshot = useCallback(
    (remoteId: string): VoicePeerPairSnapshot => {
      const mesh = buildMeshPeerSummary(remoteId);
      const marks = getPeerPipelineMarks(remoteId);
      const connectionId = connectionIdsRef.current.get(remoteId) ?? null;
      const recordedPair = p2pNoRelaySelectedPairRef.current.get(remoteId);
      const stats = peerIceDiagnosticsRef.current.get(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      const role: "active" | "passive" =
        deviceId < remoteId ? "active" : "passive";
      const storedPolicy = peerIcePolicyRef.current.get(remoteId);
      const policy: "relay" | "all" =
        storedPolicy === "relay"
          ? "relay"
          : resolvePeerIceTransportPolicy({
              p2pEnabled: p2pEnabledRef.current,
              staticTurnEnabled: turnFallbackEnabledRef.current,
              voiceRouteTurn: voiceRouteRef.current === "turn",
            });
      const route =
        recordedPair?.route ??
        (policy === "relay" ||
        stats?.localTypes.has("relay") ||
        stats?.remoteTypes.has("relay")
          ? "turn"
          : stats?.localTypes.size || stats?.remoteTypes.size
            ? "p2p"
            : "unknown");
      const signalTimes = [
        timestamps.lastOfferAt,
        timestamps.lastAnswerAt,
        timestamps.lastIceCandidateAt,
      ].filter((value): value is number => value != null);
      const audioTimes = [
        timestamps.lastPlaySuccessAt,
        timestamps.lastPlaybackConfirmedAt,
        timestamps.lastOnTrackAt,
      ].filter((value): value is number => value != null);
      const iceConnected =
        mesh.iceConnectionState === "connected" ||
        mesh.iceConnectionState === "completed";
      const diag = getVoicePeerPairDiag(remoteId, connectionId);
      const health = remotePlaybackHealthRef.current.get(remoteId);
      const closeReason =
        lastPeerCloseReasonRef.current.get(remoteId) ??
        diag?.lastCloseReason ??
        null;

      let subClass: OneWayAudioSubClass | null = diag?.subClass ?? null;
      if (!subClass && iceConnected && !marks.audio_confirmed_strict) {
        const trackOk =
          marks.remote_track_received || mesh.remoteTracksCount > 0;
        const classified = classifyPeerAudioSubClass(remoteId, {
          health: health ?? null,
          playbackStrict: marks.audio_confirmed_strict,
          remoteTrackReceived: trackOk,
        });
        subClass = classified !== "OK" ? classified : null;
      }

      const signalingIssue = detectSignalingAsymmetry({
        role,
        offerSent: marks.offer_sent,
        offerReceived: marks.offer_received,
        answerSent: marks.answer_sent,
        answerReceived: marks.answer_received,
        iceSent: marks.ice_sent,
        iceReceived: marks.ice_received,
        iceConnected,
        msSinceConnectStart: mesh.msSinceConnectStart,
      });

      const baseClass = classifyVoicePipelineFailure(remoteId);
      const audioStrictConfirmed =
        iceConnected &&
        (marks.audio_confirmed_strict || health?.audioConfirmedStrict === true);

      const enriched = enrichPeerVoiceClass(
        baseClass,
        {
          iceConnected,
          audioConfirmedStrict: audioStrictConfirmed,
          remoteTrackReceived: marks.remote_track_received,
        },
        subClass,
        signalingIssue
      );

      return {
        remoteDeviceId: remoteId,
        connectionId,
        role,
        policy,
        route,
        pcState: mesh.connectionState ?? "none",
        iceState: mesh.iceConnectionState ?? "none",
        signalingState: mesh.signalingState ?? "none",
        offerSent: marks.offer_sent,
        offerReceived: marks.offer_received,
        answerSent: marks.answer_sent,
        answerReceived: marks.answer_received,
        iceSent: marks.ice_sent,
        iceReceived: marks.ice_received,
        iceConnected,
        remoteTrackReceived: marks.remote_track_received,
        audioConfirmed: audioStrictConfirmed,
        audioConfirmedStrict: audioStrictConfirmed,
        audioProvisional:
          !audioStrictConfirmed &&
          (marks.audio_provisional || timestamps.lastPlaySuccessAt != null),
        lastSignalAt: signalTimes.length ? Math.max(...signalTimes) : null,
        lastIceAt: timestamps.lastIceCandidateAt,
        lastTrackAt: timestamps.lastOnTrackAt,
        lastAudioAt: audioTimes.length ? Math.max(...audioTimes) : null,
        lastAudioConfirmedAt: timestamps.lastPlaybackConfirmedAt,
        lastCloseReason: closeReason,
        selectedLocalCandidateType: recordedPair?.localType ?? null,
        selectedRemoteCandidateType: recordedPair?.remoteType ?? null,
        inboundDeltaBytes: diag?.inboundDeltaBytes ?? 0,
        outboundDeltaBytes: diag?.outboundDeltaBytes ?? 0,
        signalingIssue,
        voiceClass: enriched.voiceClass,
        subClass: enriched.subClass,
        updatedAt: Date.now(),
      };
    },
    [buildMeshPeerSummary, classifyPeerAudioSubClass, deviceId]
  );

  const syncPeerPairDiagnostics = useCallback(
    (opts?: { logPairs?: boolean }) => {
      const remoteIds = getRemoteIds();
      const peerIds = Array.from(
        new Set([...remoteIds, ...Array.from(pcsRef.current.keys())])
      );
      const snapshots = peerIds.map((remoteId) =>
        buildPeerPairSnapshot(remoteId)
      );
      updateVoicePeerPairCache(snapshots);

      if (!opts?.logPairs) return;

      for (const snap of snapshots) {
        logVoicePeerPair({
          ...snap,
          voiceClass: snap.voiceClass,
          subClass: snap.subClass,
        });

        const mesh = buildMeshPeerSummary(snap.remoteDeviceId);
        if (snap.signalingIssue) {
          debugConsoleLog(
            `[voice-peer-role] anomaly remote=${compactDeviceId(snap.remoteDeviceId)} ` +
              `role=${snap.role} issue=${snap.signalingIssue} class=B ` +
              `ms=${mesh.msSinceConnectStart ?? "-"}`
          );
        }
        if (
          snap.role === "active" &&
          !snap.offerSent &&
          (mesh.msSinceConnectStart ?? 0) > 8_000
        ) {
          debugConsoleLog(
            `[voice-peer-role] anomaly remote=${compactDeviceId(snap.remoteDeviceId)} ` +
              `role=active issue=offer_sent_missing ms=${mesh.msSinceConnectStart ?? "-"}`
          );
        }
        if (
          snap.role === "passive" &&
          !snap.offerReceived &&
          (mesh.msSinceConnectStart ?? 0) > 8_000
        ) {
          debugConsoleLog(
            `[voice-peer-role] anomaly remote=${compactDeviceId(snap.remoteDeviceId)} ` +
              `role=passive issue=passive_wait_offer_stuck ms=${mesh.msSinceConnectStart ?? "-"}`
          );
        }
        if (snap.role === "passive" && snap.offerSent && !snap.offerReceived) {
          debugConsoleLog(
            `[voice-peer-role] anomaly remote=${compactDeviceId(snap.remoteDeviceId)} ` +
              `role=passive issue=both_passive_or_passive_sent_offer`
          );
        }
        if (snap.role === "active" && snap.offerReceived && !snap.offerSent) {
          debugConsoleLog(
            `[voice-peer-role] anomaly remote=${compactDeviceId(snap.remoteDeviceId)} ` +
              `role=active issue=both_active_glare`
          );
        }
        if (relayForcedRef.current && snap.policy !== "relay") {
          debugConsoleLog(
            `[voice-peer] policy-violation remote=${compactDeviceId(snap.remoteDeviceId)} ` +
              `policy=relay localType=${snap.selectedLocalCandidateType ?? "-"} route=${snap.route}`
          );
        }
        if (
          relayForcedRef.current &&
          snap.selectedLocalCandidateType &&
          snap.selectedLocalCandidateType !== "relay" &&
          snap.iceConnected
        ) {
          debugConsoleLog(
            `[voice-peer] policy-violation remote=${compactDeviceId(snap.remoteDeviceId)} ` +
              `policy=relay localType=${snap.selectedLocalCandidateType} route=${snap.route}`
          );
        }
        if (
          relayForcedRef.current &&
          snap.route !== "turn" &&
          snap.iceConnected
        ) {
          debugConsoleLog(
            `[voice-peer] policy-violation remote=${compactDeviceId(snap.remoteDeviceId)} ` +
              `policy=relay localType=${snap.selectedLocalCandidateType ?? "-"} route=${snap.route}`
          );
        }
      }
    },
    [buildMeshPeerSummary, buildPeerPairSnapshot, getRemoteIds]
  );

  const isRemoteInCall = useCallback(
    (remoteId: string) => {
      const strict = getStrictRemoteIds();
      if (strict.includes(remoteId)) return true;

      if (isStableVoiceJoinMode()) {
        const decision = shouldCloseRemotePeerNow(
          remoteId,
          strict,
          remotePeerGraceRefsRef.current
        );
        return (
          !decision.closeNow &&
          (decision.via === "grace_active" ||
            decision.via === "session_member_grace")
        );
      }

      const decision = shouldCloseRemotePeerNow(
        remoteId,
        strict,
        remotePeerGraceRefsRef.current
      );
      return !decision.closeNow && decision.via === "grace_active";
    },
    [getStrictRemoteIds]
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
      logVoiceEnsureSkipped({
        remoteId,
        requestedReason,
        skipReason,
        extra,
      });
      if (skipReason === "already_has_pc" || skipReason === "playback_established") {
        return;
      }
      let blockedReason = mapEnsureSkipToVoiceStartBlocked(skipReason);
      if (
        micPermissionDeniedRef.current &&
        (skipReason === "local_track_not_live" || skipReason === "mic_not_ready")
      ) {
        blockedReason = "mic_permission_denied";
      }
      logVoiceStartBlocked(remoteId, blockedReason);
    },
    [micPermissionDeniedRef]
  );

  const canSendVoiceOffer = useCallback((): boolean => {
    return isLocalTrackLive(localAudioTrackRef, localStreamRef);
  }, [localAudioTrackRef, localStreamRef]);

  const getMicOfferBlockReason = useCallback((): VoiceStartBlockedReason => {
    if (micPermissionDeniedRef.current) return "mic_permission_denied";
    return "mic_not_ready";
  }, [micPermissionDeniedRef]);

  const logMicOfferBlocked = useCallback(
    (remoteId: string) => {
      logVoiceStartBlocked(remoteId, getMicOfferBlockReason());
    },
    [getMicOfferBlockReason]
  );

  const emitVoiceStartCheck = useCallback(
    (remoteId: string) => {
      const isOfferOwner = deviceId < remoteId;
      const role: "active" | "passive" = isOfferOwner ? "active" : "passive";
      const receiveOnly = isReceiveOnlyMutedSession(
        voicePolicy.releaseMicOnMute,
        userMutedRef
      );
      const localTrackLive = isLocalTrackLive(
        localAudioTrackRef,
        localStreamRef
      );
      const settingsReady = voiceSettingsReadyRef.current;
      const hasTurn = hasTurnIceServer(iceServersRef.current);
      const remoteIds = getRemoteIds();
      const canCreatePassive =
        role === "passive" &&
        peerNeedsPc(remoteId) &&
        isRemoteInCall(remoteId) &&
        settingsReady &&
        signalReady;
      const canCreateActive =
        role === "active" &&
        peerNeedsPc(remoteId) &&
        isRemoteInCall(remoteId) &&
        settingsReady &&
        signalReady &&
        micReady &&
        (localTrackLive || receiveOnly);
      let blockedReason: VoiceStartBlockedReason | string = "-";
      if (!settingsReady) blockedReason = "settings_not_ready";
      else if (!signalReady) blockedReason = "signal_not_ready";
      else if (relayForcedRef.current && !hasTurn) blockedReason = "turn_not_loaded";
      else if (!isRemoteInCall(remoteId)) blockedReason = "not_in_call";
      else if (
        shouldSuppressPassiveOfferReschedule(
          getPeerNegotiationPhaseRef.current(remoteId)
        )
      ) {
        blockedReason = "already_has_pc";
      } else if (!localTrackLive && !receiveOnly) {
        blockedReason = micPermissionDeniedRef.current
          ? "mic_permission_denied"
          : role === "active" && !micReady
            ? "mic_not_ready"
            : "local_track_not_live";
      } else if (role === "active" && !micReady) blockedReason = "mic_not_ready";

      const lastLog = voiceStartCheckLastLogRef.current.get(remoteId);
      const nowMs = Date.now();
      const shouldLogStartCheck =
        !lastLog ||
        lastLog.blockedReason !== String(blockedReason) ||
        nowMs - lastLog.atMs >= VOICE_START_CHECK_LOG_DEDUPE_MS;
      if (shouldLogStartCheck) {
        voiceStartCheckLastLogRef.current.set(remoteId, {
          atMs: nowMs,
          blockedReason: String(blockedReason),
        });
        logVoiceStartCheck({
          deviceId,
          remoteId,
          sessionId,
          membersCount: members.length,
          remoteIdsCount: remoteIds.length,
          settingsReady,
          hasTurn,
          p2pEnabled: p2pEnabledRef.current,
          icePolicy: getPeerIceTransportPolicy(),
          signalReady,
          micReady,
          shouldCreatePeer: canCreatePassive || canCreateActive,
          role,
          blockedReason,
        });
      }
    },
    [
      deviceId,
      getPeerIceTransportPolicy,
      getRemoteIds,
      isRemoteInCall,
      localAudioTrackRef,
      localStreamRef,
      members.length,
      micReady,
      micPermissionDeniedRef,
      peerNeedsPc,
      sessionId,
      signalReady,
      userMutedRef,
      voicePolicy.releaseMicOnMute,
    ]
  );

  const emitMeshSummary = useCallback(
    (trigger: string, opts?: { immediate?: boolean }) => {
      const run = () => {
        const memberDeviceIds = members
          .map((m) => String(m.device_id ?? "").trim())
          .filter(Boolean);
        const inCallMemberDeviceIds = isStableVoiceJoinMode()
          ? members
              .map((m) => String(m.device_id ?? "").trim())
              .filter(Boolean)
          : members
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
          debugConsoleLog(
            `[voice-peer] checkVoiceMeshExpectations error trigger=${trigger} err=${String(err)}`
          );
        }
        syncPeerPairDiagnostics({ logPairs: opts?.immediate === true });
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
    [
      buildMeshPeerSummary,
      deviceId,
      getRemoteIds,
      members,
      sessionId,
      syncPeerPairDiagnostics,
    ]
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
          p2pDirectFailedHoldRemainingMs = Math.ceil(remaining / 5000) * 5000;
        } else {
          p2pDirectFailedHoldUntilRef.current.delete(remoteId);
        }
      }

      const trackReady =
        audioTrack?.readyState ?? media.primaryTrackReadyState ?? "-";
      const hasLiveRemoteStream =
        trackReady === "live" && media.hasRemoteStream;
      const waitCheck = getLiveStreamWaitConnectedCheckForPeer({
        pc,
        hasLiveRemoteStream,
        remoteTracksCount: media.remoteTracksCount,
        hasRemoteStream: media.hasRemoteStream,
        timestamps,
        connectStartedAt: connectStartedAtRef.current.get(remoteId),
      });

      diagnostics[remoteId] = {
        hasPc: isUsablePeerConnection(pc),
        conn: pc?.connectionState ?? "-",
        ice: pc?.iceConnectionState ?? "-",
        sig: pc?.signalingState ?? "-",
        hasRemoteStream: media.hasRemoteStream,
        remoteTracksCount: media.remoteTracksCount,
        trackReady,
        isRemoteInCall: isRemoteInCall(remoteId),
        lastPlaybackActiveAt: timestamps.lastPlaybackActiveAt,
        lastPlaybackConfirmedAt: timestamps.lastPlaybackConfirmedAt,
        lastOnTrackAt: timestamps.lastOnTrackAt,
        lastUnmuteAt: timestamps.lastUnmuteAt,
        lastPlaySuccessAt: timestamps.lastPlaySuccessAt,
        remoteAudioMounted: !!remoteAudiosRef.current[remoteId],
        orphanRemoteAudio: orphanRemoteAudioRef.current.has(remoteId),
        liveStreamHealHold: waitCheck?.shouldHold === true,
        p2pDirectFailedHoldActive: p2pDirectFailedHoldRemainingMs != null,
        p2pDirectFailedHoldRemainingMs,
        autoHardResetInProgress: autoHardResetInProgressRef.current.has(remoteId),
        autoHardResetGiveUp: autoHardResetGiveUpRef.current.has(remoteId),
        autoHardResetAttempts:
          autoHardResetAttemptCountRef.current.get(remoteId) ?? 0,
        reconnectRequestSent:
          (passiveReconnectStateRef.current.get(remoteId)?.sentAt ?? null) !=
          null,
        reconnectRequestPending:
          passiveReconnectStateRef.current.has(remoteId) &&
          passiveReconnectStateRef.current.get(remoteId)?.sentAt == null,
        transportUnconfirmed: isPeerTransportUnconfirmed({
          conn: pc?.connectionState ?? "-",
          ice: pc?.iceConnectionState ?? "-",
          lastPlaybackConfirmedAt: timestamps.lastPlaybackConfirmedAt,
          lastPlaySuccessAt: timestamps.lastPlaySuccessAt,
          iceCheckingStuckSince:
            checkingPlaybackStuckAtRef.current.get(remoteId) ?? null,
          voiceMode: voicePolicy.voiceMode,
        }),
        p2pRetryActive:
          p2pRetryExhaustedRef.current.has(remoteId) ||
          (p2pNoRelayRetryAttemptsRef.current.get(remoteId) ?? 0) > 0 ||
          p2pNoRelayRetryInFlightRef.current.has(remoteId) ||
          p2pRetryBackgroundTimersRef.current.has(remoteId),
        p2pRetryExhausted: p2pRetryExhaustedRef.current.has(remoteId),
      };
    }

    const signature = Object.keys(diagnostics)
      .sort()
      .map((remoteId) => {
        const d = diagnostics[remoteId];
        return (
          `${compactDeviceId(remoteId)}:` +
          `${d.hasPc ? 1 : 0}/${d.conn}/${d.ice}/${d.sig}/` +
          `${d.hasRemoteStream ? 1 : 0}/${d.remoteTracksCount}/${d.trackReady}/` +
          `${d.isRemoteInCall ? 1 : 0}/${d.liveStreamHealHold ? 1 : 0}/` +
          `${d.p2pDirectFailedHoldActive ? 1 : 0}/${d.transportUnconfirmed ? 1 : 0}/` +
          `${d.p2pRetryActive ? 1 : 0}/${d.autoHardResetInProgress ? 1 : 0}/` +
          `${d.orphanRemoteAudio ? 1 : 0}`
        );
      })
      .join("|");
    const nowMs = Date.now();
    const prevEmit = lastPeerDiagnosticsEmitRef.current;
    if (
      signature !== prevEmit.signature ||
      nowMs - prevEmit.atMs >= PEER_DIAGNOSTICS_EMIT_MIN_INTERVAL_MS
    ) {
      lastPeerDiagnosticsEmitRef.current = { signature, atMs: nowMs };
      onPeerDiagnosticsChange(diagnostics);
    }
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
      if (peerStatesRef.current.get(remoteId) === state) return;
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

  const getPeerAnswerWaitState = useCallback(
    (remoteId: string) => {
      const meta = answerWaitMetaRef.current.get(remoteId) ?? null;
      const armed =
        answerWaitTimersRef.current.has(remoteId) || meta != null;
      const marks = getPeerPipelineMarks(remoteId);
      const pc = pcsRef.current.get(remoteId) ?? null;
      const elapsedMs = meta ? Date.now() - meta.armedAt : 0;
      const remainingMs = meta
        ? Math.max(0, ANSWER_WAIT_TIMEOUT_MS - elapsedMs)
        : 0;
      const awaiting =
        armed &&
        !marks.answer_received &&
        (pc?.signalingState === "have-local-offer" || marks.offer_sent);
      return {
        awaiting,
        meta,
        pc,
        marks,
        elapsedMs,
        remainingMs,
        connectionId: meta?.connectionId ?? null,
        currentConnectionId: getCurrentConnectionId(remoteId),
        signalingState: pc?.signalingState ?? "-",
        offerReason: meta?.reason ?? "-",
      };
    },
    [getCurrentConnectionId]
  );

  const isPeerAwaitingRemoteAnswer = useCallback(
    (remoteId: string) => getPeerAnswerWaitState(remoteId).awaiting,
    [getPeerAnswerWaitState]
  );

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

      if (old != null) {
        resetVoicePeerMarks(remoteId);
        resetVoicePeerPairDiag(remoteId);
        resetPeerAudioDiagnostics(remoteId);
        purgeVoicePeerPairCacheForRemote(remoteId);
        oneWayAudioLoggedRef.current.forEach((key) => {
          if (key === remoteId || key.startsWith(`${remoteId}:`)) {
            oneWayAudioLoggedRef.current.delete(key);
          }
        });
        for (const key of Array.from(loggedConnectedRef.current)) {
          if (key.startsWith(`${remoteId}:`)) {
            loggedConnectedRef.current.delete(key);
          }
        }
        for (const key of Array.from(loggedAudioStrictRef.current)) {
          if (key.startsWith(`${remoteId}:`)) {
            loggedAudioStrictRef.current.delete(key);
          }
        }
      }

      setCurrentConnectionId(remoteId, connectionId);
      debugConsoleLog(
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
      debugConsoleLog(
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

  const logP2pRetryOnly = useCallback((remoteId: string, context: string) => {
    debugConsoleLog(
      `[voice-peer] p2p-retry-only remote=${compactDeviceId(remoteId)} ` +
        `reason=turn_disabled context=${context} ${formatVoiceModeSuffix()}`
    );
  }, []);

  const getPeerTrackReady = useCallback(
    (remoteId: string) => {
      const stream = remoteStreamsRef.current.get(remoteId);
      const track = stream?.getAudioTracks()[0];
      return track?.readyState ?? getPeerMedia(remoteId).primaryTrackReadyState ?? "-";
    },
    [getPeerMedia]
  );

  const isRemoteMediaTransportReady = useCallback(
    (remoteId: string, pc?: RTCPeerConnection | null) => {
      const activePc = pc ?? pcsRef.current.get(remoteId);
      if (!activePc) return false;
      if (activePc.connectionState !== "connected") return false;
      if (
        activePc.iceConnectionState !== "connected" &&
        activePc.iceConnectionState !== "completed"
      ) {
        return false;
      }

      const marks = getPeerPipelineMarks(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      const media = getPeerMedia(remoteId);

      return (
        marks.remote_track_received ||
        timestamps.lastOnTrackAt != null ||
        media.remoteTracksCount >= 1 ||
        media.hasRemoteStream
      );
    },
    [getPeerMedia]
  );

  const hasRemotePlaybackEvidence = useCallback((remoteId: string) => {
    const health = remotePlaybackHealthRef.current.get(remoteId);
    const timestamps =
      peerSignalTimestampsRef.current.get(remoteId) ??
      emptyPeerSignalTimestamps();

    return (
      health?.audioConfirmedStrict === true ||
      health?.audioActuallyPlaying === true ||
      health?.playSuccess === true ||
      health?.playbackActive === true ||
      (health?.level ?? 0) > 0.001 ||
      timestamps.lastPlaySuccessAt != null ||
      timestamps.lastPlaybackConfirmedAt != null ||
      timestamps.lastPlaybackActiveAt != null
    );
  }, []);

  const getPlaybackEstablishedEvidence = useCallback(
    (remoteId: string): VoicePlaybackEstablishedEvidence => {
      const marks = getPeerPipelineMarks(remoteId);
      const health = remotePlaybackHealthRef.current.get(remoteId);
      return {
        hasPlaybackEvidence: hasRemotePlaybackEvidence(remoteId),
        audioConfirmedStrict:
          marks.audio_confirmed_strict || health?.audioConfirmedStrict === true,
      };
    },
    [hasRemotePlaybackEvidence]
  );

  const getPeerNegotiationPhase = useCallback(
    (remoteId: string, pc?: RTCPeerConnection | null): PeerNegotiationPhase => {
      const activePc = pc ?? pcsRef.current.get(remoteId) ?? null;
      const marks = getPeerPipelineMarks(remoteId);
      const media = getPeerMedia(remoteId);
      const health = remotePlaybackHealthRef.current.get(remoteId);

      return classifyPeerNegotiationPhase({
        pc: activePc,
        isUsablePeer: isUsablePeerConnection(activePc),
        remoteTrackReceived: marks.remote_track_received,
        hasPlaybackEvidence: hasRemotePlaybackEvidence(remoteId),
        audioConfirmedStrict:
          marks.audio_confirmed_strict || health?.audioConfirmedStrict === true,
        answerReceived: marks.answer_received,
        offerSent: marks.offer_sent,
        offerReceived: marks.offer_received,
        answerSent: marks.answer_sent,
        offerInFlight: offeredPeersRef.current.has(remoteId),
        remoteTracksCount: media.remoteTracksCount,
        hasRemoteStream: media.hasRemoteStream,
      });
    },
    [getPeerMedia, hasRemotePlaybackEvidence]
  );

  getPeerNegotiationPhaseRef.current = getPeerNegotiationPhase;

  const getEstablishedPeerSkipReasonForPeer = useCallback(
    (
      remoteId: string
    ): "audio_confirmed_strict" | "playback_evidence" | null => {
      const frozen = peerAutoRecoveryFrozenRef.current.get(remoteId);
      if (frozen) return frozen;
      return getEstablishedPeerAutoRecoverySkipReason(
        getPlaybackEstablishedEvidence(remoteId)
      );
    },
    [getPlaybackEstablishedEvidence]
  );

  const shouldSuppressAutoVoiceRecoveryForPeer = useCallback(
    (remoteId: string): boolean => {
      if (manualHardResetHealPassRef.current.has(remoteId)) return false;
      return getEstablishedPeerSkipReasonForPeer(remoteId) != null;
    },
    [getEstablishedPeerSkipReasonForPeer]
  );

  const clearEstablishedPeerAutoRecoveryStateRef = useRef<
    (remoteId: string, reason: string) => void
  >(() => {});

  const markPeerAutoRecoveryFrozenRef = useRef<
    (
      remoteId: string,
      reason: "audio_confirmed_strict" | "playback_evidence"
    ) => void
  >(() => {});

  const buildIceDisconnectedGuardInput = useCallback(
    (
      remoteId: string,
      pc?: RTCPeerConnection | null
    ): IceDisconnectedGuardInput => {
      const activePc = pc ?? pcsRef.current.get(remoteId) ?? null;
      const marks = getPeerPipelineMarks(remoteId);
      const health = remotePlaybackHealthRef.current.get(remoteId);

      return {
        hasPlaybackEvidence: hasRemotePlaybackEvidence(remoteId),
        audioConfirmedStrict:
          marks.audio_confirmed_strict || health?.audioConfirmedStrict === true,
        trackLive: getPeerTrackReady(remoteId) === "live",
        inboundDeltaBytes: getPeerInboundDeltaBytes(remoteId),
        outboundDeltaBytes: getPeerOutboundDeltaBytes(remoteId),
        conn: activePc?.connectionState ?? "-",
        ice: activePc?.iceConnectionState ?? "-",
      };
    },
    [getPeerTrackReady, hasRemotePlaybackEvidence]
  );

  const logIceDisconnectedReconnectSuppressed = useCallback(
    (
      remoteId: string,
      reason: IceDisconnectedSuppressReason,
      context: string
    ) => {
      debugConsoleLog(
        `[voice-peer] reconnect_ice_disconnected_suppressed remote=${compactDeviceId(remoteId)} ` +
          `reason=${reason} context=${context} ${formatVoiceModeSuffix()}`
      );
    },
    []
  );

  const logPcDisconnectedReconnectSuppressed = useCallback(
    (
      remoteId: string,
      reason: IceDisconnectedSuppressReason,
      context: string
    ) => {
      debugConsoleLog(
        `[voice-peer] reconnect_pc_disconnected_suppressed remote=${compactDeviceId(remoteId)} ` +
          `reason=${reason} context=${context} ${formatVoiceModeSuffix()}`
      );
    },
    []
  );

  const shouldSuppressTransportDisconnectReconnect = useCallback(
    (
      remoteId: string,
      reconnectReason: string,
      pc?: RTCPeerConnection | null,
      context = "schedule"
    ): IceDisconnectedSuppressReason | null => {
      const input = buildIceDisconnectedGuardInput(remoteId, pc);
      const suppress = evaluateIceDisconnectedReconnectSuppressReason(input);
      if (!suppress) return null;

      const disconnectKind = classifyTransportDisconnect({
        reconnectReason,
        conn: input.conn,
        ice: input.ice,
      });
      if (!disconnectKind) return null;

      if (disconnectKind === "pc") {
        logPcDisconnectedReconnectSuppressed(remoteId, suppress, context);
        return suppress;
      }

      if (reconnectReason === "ice_failed") {
        logIceDisconnectedReconnectSuppressed(remoteId, suppress, context);
        return suppress;
      }

      if (
        reconnectReason === "ice_disconnected" ||
        isPeerIceDisconnectedOnly(input) ||
        input.conn === "connected"
      ) {
        logIceDisconnectedReconnectSuppressed(remoteId, suppress, context);
        return suppress;
      }

      return null;
    },
    [
      buildIceDisconnectedGuardInput,
      logIceDisconnectedReconnectSuppressed,
      logPcDisconnectedReconnectSuppressed,
    ]
  );

  const cancelConnectedAudioConfirmTimer = useCallback(
    (
      remoteId: string,
      reason: VoiceAudioConfirmCancelReason,
      pc?: RTCPeerConnection | null
    ) => {
      const timer = connectedAudioConfirmTimersRef.current.get(remoteId);
      if (!timer) return false;

      window.clearTimeout(timer);
      connectedAudioConfirmTimersRef.current.delete(remoteId);
      connectedAudioConfirmArmedAtRef.current.delete(remoteId);

      const activePc = pc ?? pcsRef.current.get(remoteId) ?? null;
      logVoiceAudioConfirmTimer({
        remoteId,
        phase: "cancel",
        reason,
        sig: activePc?.signalingState,
        conn: activePc?.connectionState,
        ice: activePc?.iceConnectionState,
      });
      return true;
    },
    []
  );

  const shouldRejectIncomingStaleOffer = useCallback(
    (
      remoteId: string,
      incomingConnectionId: string,
      pc?: RTCPeerConnection | null
    ) => {
      const activePc = pc ?? pcsRef.current.get(remoteId) ?? null;
      const media = getPeerMedia(remoteId);
      const marks = getPeerPipelineMarks(remoteId);

      return shouldRejectEstablishedPeerStaleOffer({
        currentConnectionId: getCurrentConnectionId(remoteId),
        incomingConnectionId,
        conn: activePc?.connectionState ?? "-",
        ice: activePc?.iceConnectionState ?? "-",
        sig: activePc?.signalingState ?? "-",
        remoteTrackReceived: marks.remote_track_received,
        answerReceived: marks.answer_received,
        remoteTracksCount: media.remoteTracksCount,
        hasRemoteStream: media.hasRemoteStream,
        hasPlaybackEvidence: hasRemotePlaybackEvidence(remoteId),
      });
    },
    [getCurrentConnectionId, getPeerMedia, hasRemotePlaybackEvidence]
  );

  const markVoiceJoinEpochIfNeeded = useCallback(() => {
    const epoch = voiceJoinEpochRef.current;
    if (epoch.sessionId !== sessionId || epoch.startedAt <= 0) {
      voiceJoinEpochRef.current = { sessionId, startedAt: Date.now() };
      debugConsoleLog(
        `[voice-peer] join-stabilization-start session=${sessionId.slice(-6)} ` +
          `ms=${VOICE_JOIN_STABILIZATION_MS}`
      );
    }
  }, [sessionId]);

  const getVoiceJoinStabilizationRemainingMs = useCallback(() => {
    const epoch = voiceJoinEpochRef.current;
    if (epoch.sessionId !== sessionId || epoch.startedAt <= 0) return 0;
    return Math.max(0, VOICE_JOIN_STABILIZATION_MS - (Date.now() - epoch.startedAt));
  }, [sessionId]);

  const isVoiceJoinStabilizing = useCallback(() => {
    return getVoiceJoinStabilizationRemainingMs() > 0;
  }, [getVoiceJoinStabilizationRemainingMs]);

  const scheduleDeferredHealPeerConnections = useCallback(
    (reason: string) => {
      const remaining = getVoiceJoinStabilizationRemainingMs();
      if (remaining <= 0) {
        healPeerConnectionsRef.current();
        return;
      }
      if (deferredHealTimerRef.current != null) return;
      debugConsoleLog(
        `[voice-peer] heal-deferred reason=${reason} remainingMs=${remaining} ` +
          `session=${sessionId.slice(-6)}`
      );
      deferredHealTimerRef.current = window.setTimeout(() => {
        deferredHealTimerRef.current = null;
        healPeerConnectionsRef.current();
      }, remaining);
    },
    [getVoiceJoinStabilizationRemainingMs, sessionId]
  );

  const isPeerEstablishedForRecovery = useCallback(
    (remoteId: string, pc?: RTCPeerConnection | null) => {
      const activePc = pc ?? pcsRef.current.get(remoteId);
      if (!activePc) return false;

      const marks = getPeerPipelineMarks(remoteId);
      if (!marks.audio_confirmed_strict) return false;

      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();

      const playbackHealth = remotePlaybackHealthRef.current.get(remoteId);

      return isPeerP2pEstablished({
        conn: activePc.connectionState,
        ice: activePc.iceConnectionState,
        lastPlaybackConfirmedAt: timestamps.lastPlaybackConfirmedAt,
        trackReady: getPeerTrackReady(remoteId),
        lastPlaybackActiveAt: timestamps.lastPlaybackActiveAt,
        lastPlaySuccessAt: timestamps.lastPlaySuccessAt,
        audioActuallyPlaying: playbackHealth?.audioConfirmedStrict === true,
      });
    },
    [getPeerTrackReady]
  );

  const buildReconnectDecisionInput = useCallback(
    (
      remoteId: string,
      reason: string,
      source: string,
      opts?: { callerHint?: string; force?: boolean }
    ): VoiceReconnectDecisionInput => {
      const pc = pcsRef.current.get(remoteId) ?? null;
      const media = getPeerMedia(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      const preserveUntil =
        preserveRemoteAudioUntilRef.current.get(remoteId) ?? 0;

      return {
        remoteId,
        reason,
        source,
        callerHint: opts?.callerHint,
        force: opts?.force,
        conn: pc?.connectionState ?? "-",
        ice: pc?.iceConnectionState ?? "-",
        sig: pc?.signalingState ?? "-",
        hasRemoteStream: media.hasRemoteStream,
        tracks: media.remoteTracksCount,
        trackLive: getPeerTrackReady(remoteId),
        health: remotePlaybackHealthRef.current.get(remoteId) ?? null,
        confirmedAt: timestamps.lastPlaybackConfirmedAt,
        lastPlaySuccessAt: timestamps.lastPlaySuccessAt,
        lastPlaybackActiveAt: timestamps.lastPlaybackActiveAt,
        voiceRoute: voiceRouteRef.current,
        preserveAudioWindowActive:
          preserveUntil > 0 && Date.now() < preserveUntil,
        establishedRecovery: isPeerEstablishedForRecovery(remoteId, pc),
        hasLiveRemoteStream: hasLiveRemoteAudioStream(remoteId),
      };
    },
    [
      getPeerMedia,
      getPeerTrackReady,
      hasLiveRemoteAudioStream,
      isPeerEstablishedForRecovery,
    ]
  );

  const isPeerEligibleForP2pIceRetry = useCallback(
    (remoteId: string, pc?: RTCPeerConnection | null) => {
      if (!p2pEnabledRef.current) return false;
      const activePc = pc ?? pcsRef.current.get(remoteId);
      if (!activePc || !isUsablePeerConnection(activePc)) return false;
      if (isPeerEstablishedForRecovery(remoteId, activePc)) return false;
      if (!isPcConnectingOrIceChecking(activePc)) return false;
      if (!hasLiveRemoteAudioStream(remoteId)) return false;

      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      return timestamps.lastPlaybackConfirmedAt == null;
    },
    [hasLiveRemoteAudioStream, isPeerEstablishedForRecovery]
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
      phase: "connected" | "failed" = "connected",
      opts?: { repeat?: boolean; reason?: string }
    ) => {
      const connectionId = getCurrentConnectionId(remoteId);
      const logKey = `${remoteId}:${connectionId ?? "none"}:${phase}`;

      if (
        phase === "connected" &&
        loggedConnectedRef.current.has(logKey) &&
        opts?.repeat !== true
      ) {
        return;
      }

      try {
        const result =
          phase === "connected"
            ? await detectConnectionType(pc)
            : { route: "unknown", localType: null, remoteType: null };

        const startedAt = connectStartedAtRef.current.get(remoteId);
        const timeToConnectMs = startedAt ? Date.now() - startedAt : null;

        const remoteIdsSnapshot = getRemoteIds();
        const logSnapshot = buildVoiceConnectionLogSnapshot({
          remoteId,
          connectionId,
          pc,
          phase,
          peerCloseReason:
            phase === "failed"
              ? lastPeerCloseReasonRef.current.get(remoteId) ?? null
              : null,
          remoteIdsSnapshot,
        });
        const failureCtx = phase === "failed" ? logSnapshot : null;
        let connectedStats: PeerRtpStatsSnapshot | null = null;
        if (phase === "connected") {
          try {
            connectedStats = await collectPeerRtpStats(pc, remoteId);
          } catch {
            connectedStats = null;
          }
        }

        const connectionState =
          phase === "failed" && failureCtx
            ? formatVoiceFailureConnectionState(failureCtx)
            : phase === "connected"
              ? formatVoiceConnectedConnectionState(
                  buildVoiceConnectedAudioState(
                    remoteId,
                    result.route,
                    connectedStats
                  )
                )
              : "failed";

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
            voiceRoute:
              phase === "failed" && failureCtx
                ? `fail-${failureCtx.voiceClass}`
                : voiceRouteRef.current,
            connectionState,
            timeToConnectMs,
            os: osRef.current,
            memberCount: members.length,
          }),
        });

        if (phase === "failed" && failureCtx) {
          debugConsoleLog(
            `[voice-peer] connection-failed-log class=${failureCtx.voiceClass} ` +
              `remote=${compactDeviceId(remoteId)} connId=${compactConnectionId(connectionId)} ` +
              `offer=${failureCtx.offerSent ? 1 : 0} answer=${failureCtx.answerReceived ? 1 : 0} ` +
              `ice=${failureCtx.iceConnected ? 1 : 0} ` +
              `audio=${failureCtx.audioConfirmedStrict ? 1 : 0} ` +
              `close=${failureCtx.peerCloseReason ?? "-"} remotes=${failureCtx.remoteIdsSnapshot}`
          );
        }

        if (phase === "connected") {
          if (opts?.repeat === true) {
            debugConsoleLog(
              `[voice-peer] connection-log-refresh remote=${compactDeviceId(remoteId)} ` +
                `reason=${opts.reason ?? "repeat"} state=${connectionState}`
            );
          } else {
            loggedConnectedRef.current.add(logKey);
          }
        }
      } catch (e) {
        console.warn("[call] voice log failed", e);
      }
    },
    [
      buildVoiceConnectedAudioState,
      deviceId,
      getCurrentConnectionId,
      getRemoteIds,
      members.length,
      sessionId,
    ]
  );

  const refreshConnectedVoiceLogForAudioStrict = useCallback(
    (remoteId: string, source: string) => {
      const connectionId = getCurrentConnectionId(remoteId);
      const strictLogKey = `${remoteId}:${connectionId ?? "none"}:audio_strict`;
      if (loggedAudioStrictRef.current.has(strictLogKey)) return;

      const pc = pcsRef.current.get(remoteId);
      if (
        !pc ||
        !isTransportMediaConnected(pc.connectionState, pc.iceConnectionState)
      ) {
        return;
      }

      const marks = getPeerPipelineMarks(remoteId);
      const health = remotePlaybackHealthRef.current.get(remoteId);
      const strict =
        marks.audio_confirmed_strict || health?.audioConfirmedStrict === true;
      if (!strict) return;

      loggedAudioStrictRef.current.add(strictLogKey);
      debugConsoleLog(
        `[voice-peer] audio-strict-log-upgrade remote=${compactDeviceId(remoteId)} ` +
          `source=${source} mark=${marks.audio_confirmed_strict ? 1 : 0} ` +
          `health=${health?.audioConfirmedStrict === true ? 1 : 0}`
      );
      void logVoiceConnection(remoteId, pc, "connected", {
        repeat: true,
        reason: `audio_strict_${source}`,
      });
    },
    [getCurrentConnectionId, logVoiceConnection]
  );

  refreshConnectedVoiceLogForAudioStrictRef.current =
    refreshConnectedVoiceLogForAudioStrict;

  const upsertRemoteAudio = useCallback(
    (
      remoteId: string,
      stream: MediaStream,
      opts?: { reason?: string; force?: boolean }
    ) => {
      const audioTrack = stream.getAudioTracks()[0] ?? null;
      if (!audioTrack || audioTrack.readyState !== "live") {
        debugConsoleLog(
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
      markVoiceNegotiationStep(remoteId, "remote_track_applied", `reason=${opts?.reason ?? "ontrack"}`);
      markVoicePerf("remote_track_received", {
        remoteId,
        extra: `ready=${audioTrack?.readyState ?? "none"}`,
      });
      cancelPassiveWaitOffer(remoteId, "remote_track_received");
      emitMeshSummary("ontrack", { immediate: true });

      const pc = pcsRef.current.get(remoteId);
      if (pc) {
        syncPeerObservedStates(remoteId, pc);
      }

      voiceProdLog(
        `[voice-peer] remote-audio-pipeline-start remote=${compactDeviceId(remoteId)} ` +
          `reason=${opts?.reason ?? "ontrack"} streamTracks=${stream.getAudioTracks().length} ` +
          `hasRemoteAudioEntry=${remoteAudiosRef.current[remoteId] ? 1 : 0} ` +
          `conn=${pc?.connectionState ?? "-"} ice=${pc?.iceConnectionState ?? "-"}`
      );

      queueMicrotask(() => {
        triggerRemoteAudioReplayRef.current(remoteId, "remote_track_applied");
        armConnectedAudioConfirmRef.current(
          remoteId,
          opts?.reason ?? "remote_track_applied"
        );
        debugConsoleLog(
          `[voice-peer] remote-audio-pipeline-dispatch remote=${compactDeviceId(remoteId)} ` +
            `replay=1 arm=1 hasRemoteAudioEntry=${remoteAudiosRef.current[remoteId] ? 1 : 0}`
        );
      });
    },
    [members, syncPeerObservedStates, touchPeerSignal, emitMeshSummary, cancelPassiveWaitOffer]
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
      if (remoteAudiosRef.current[remoteId]) {
        debugConsoleLog(
          `[voice-peer] ensureRemoteAudioMounted remote=${compactDeviceId(remoteId)} ` +
            `reason=${reason} result=already_mounted`
        );
        return true;
      }

      const pc = pcsRef.current.get(remoteId);
      const stream = remoteStreamsRef.current.get(remoteId);
      const snapshot = getRemoteStreamAudioSnapshot(stream);

      if (stream && snapshot.hasLiveStream) {
        upsertRemoteAudio(remoteId, stream, { force: true, reason });
        debugConsoleLog(
          `[voice-peer] ensureRemoteAudioMounted remote=${compactDeviceId(remoteId)} ` +
            `reason=${reason} result=upsert_stream`
        );
        return true;
      }

      if (pc) {
        const synced = syncRemoteAudioFromPc(remoteId, pc, reason);
        if (synced) {
          debugConsoleLog(
            `[voice-peer] ensureRemoteAudioMounted remote=${compactDeviceId(remoteId)} ` +
              `reason=${reason} result=sync_from_pc`
          );
          return true;
        }

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
          debugConsoleLog(
            `[voice-peer] ensureRemoteAudioMounted remote=${compactDeviceId(remoteId)} ` +
              `reason=${reason} result=receiver_track`
          );
          return true;
        }
      }

      debugConsoleLog(
        `[voice-peer] ensureRemoteAudioMounted remote=${compactDeviceId(remoteId)} ` +
          `reason=${reason} result=miss`
      );
      return false;
    },
    [syncRemoteAudioFromPc, upsertRemoteAudio]
  );

  const triggerRemoteAudioReplay = useCallback(
    (remoteId: string, reason: string) => {
      debugConsoleLog(
        `[voice-peer] triggerRemoteAudioReplay remote=${compactDeviceId(remoteId)} reason=${reason}`
      );
      debugConsoleLog(
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
      if (isDocumentHidden()) return;
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
            if (stalled && media.remoteTracksCount > 0 && stuckAgeMs != null) {
              if (stuckAgeMs >= SOFT_REBUILD_ICE_UNCONFIRMED_MS) {
                void maybeSoftRenegotiatePeerRef.current(remoteId);
              } else if (
                stuckAgeMs >= ICE_RESTART_STUCK_MS &&
                (iceRestartAttemptsRef.current.get(remoteId) ?? 0) <
                  MAX_ICE_RESTART_ATTEMPTS
              ) {
                void attemptIceRestartRef.current(remoteId);
              }
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
              debugConsoleLog(
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
        caller?: string;
        force?: boolean;
      }
    ): boolean => {
      const shouldClearConnectionId = opts?.clearConnectionId ?? false;
      const reason = String(opts?.reason ?? "").trim() || "missing_reason";
      const caller = String(opts?.caller ?? reason).trim() || reason;
      lastPeerCloseReasonRef.current.set(remoteId, reason);
      updateVoicePeerPairDiag(remoteId, { lastCloseReason: reason });
      if (reason === "missing_reason") {
        console.warn(
          `[voice-peer] close missing reason remote=${compactDeviceId(remoteId)} ${formatVoiceModeSuffix()}`
        );
        return false;
      }

      const answerWait = getPeerAnswerWaitState(remoteId);
      const bypassAnswerWaitClose =
        reason === "leave_signal" ||
        reason === "voice_layer_cleanup" ||
        reason === "session_changed" ||
        caller === "performVoicePeerCleanup";
      if (answerWait.awaiting && !bypassAnswerWaitClose) {
        debugConsoleLog(
          `[voice-peer] close-blocked-awaiting-answer remote=${compactDeviceId(remoteId)} ` +
            `reason=${reason} caller=${caller} ` +
            `connectionId=${compactConnectionId(answerWait.connectionId)} ` +
            `currentConnectionId=${compactConnectionId(answerWait.currentConnectionId)} ` +
            `elapsedMs=${answerWait.elapsedMs} remainingMs=${answerWait.remainingMs} ` +
            `sig=${answerWait.signalingState} conn=${answerWait.pc?.connectionState ?? "-"} ` +
            `ice=${answerWait.pc?.iceConnectionState ?? "-"} offerReason=${answerWait.offerReason}`
        );
        return false;
      }

      const playbackEvidence = getPlaybackEstablishedEvidence(remoteId);
      const mutationBlock = evaluateVoicePeerMutationBlock({
        kind: "close",
        evidence: playbackEvidence,
        ctx: {
          reason,
          caller,
          force: opts?.force,
          manualHealPass: manualHardResetHealPassRef.current.has(remoteId),
        },
      });
      if (mutationBlock.blocked) {
        console.warn(
          `[voice-peer] close-blocked-playback remote=${compactDeviceId(remoteId)} ` +
            `reason=${reason} caller=${caller} ` +
            `hadPlaybackEvidence=${playbackEvidence.hasPlaybackEvidence ? 1 : 0} ` +
            `hadAudioConfirmedStrict=${playbackEvidence.audioConfirmedStrict ? 1 : 0} ` +
            `blockPlayback=${mutationBlock.blockedByPlaybackEvidence ? 1 : 0} ` +
            `blockStrict=${mutationBlock.blockedByAudioConfirmedStrict ? 1 : 0} ` +
            `${formatVoiceModeSuffix()}`
        );
        return false;
      }

      const evidence = getClosePeerEvidence(
        remoteId,
        remotePeerGraceRefsRef.current,
        membersRef.current
      );

      if (
        stableCloseRequiresEvidence(reason) &&
        !evidence.explicitLeaveSignalSeen &&
        !isExplicitPeerCloseReason(reason)
      ) {
        console.warn(
          `[voice-peer] close-blocked-stable remote=${compactDeviceId(remoteId)} reason=${reason} ` +
            `explicit=${evidence.explicitLeaveSignalSeen} missingForMs=${evidence.missingForMs ?? "-"} ` +
            `lastMembersAt=${evidence.lastSeenInMembersAt ?? "-"} ` +
            `presence=${evidence.lastPresenceState} vis=${evidence.visibilityState}`
        );
        return false;
      }

      debugConsoleLog(
        `[voice-peer] close-evidence remote=${compactDeviceId(remoteId)} reason=${reason} ` +
          `explicit=${evidence.explicitLeaveSignalSeen} missingForMs=${evidence.missingForMs ?? "-"} ` +
          `lastMembersAt=${evidence.lastSeenInMembersAt ?? "-"} ` +
          `presence=${evidence.lastPresenceState} vis=${evidence.visibilityState}`
      );

      clearDeferredMemberCloseTimer(remoteId);

      if (
        reason === "reconnect_clear_ended_audio" &&
        shouldHoldCloseForReconnectClearEnded(remoteId)
      ) {
        debugConsoleLog(
          `[voice-peer] close-hold remote=${compactDeviceId(remoteId)} ` +
            `reason=live_or_playback_stream_exists originalReason=${reason} ${formatVoiceModeSuffix()}`
        );
        if (hasStaleEndedRemoteAudio(remoteId)) {
          clearEndedRemoteAudio(remoteId);
        }
        return false;
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
      ensurePeerAttemptRef.current.delete(remoteId);
      connectedAudioConfirmGraceRef.current.delete(remoteId);
      resetVoiceNegotiationSteps(remoteId);
      offeredPeersRef.current.delete(remoteId);
      startedPeersRef.current.delete(remoteId);
      if (!preserveRemoteAudio) {
        remoteStreamsRef.current.delete(remoteId);
      }
      pendingIceRef.current.delete(remoteId);
      clearReconnectTimer(remoteId);
      clearPeerWatchdogTimers(remoteId);
      passiveFallbackOfferByConnRef.current.delete(remoteId);
      passiveJoinSettledRef.current.delete(remoteId);
      passiveWaitOfferMetaRef.current.delete(remoteId);
      clearAnswerWaitTimerRef.current(remoteId, "peer_closed", caller);
      cancelConnectedAudioConfirmTimer(remoteId, "peer_closed", pc);

      connectStartedAtRef.current.delete(remoteId);
      peerSnapshotRef.current.delete(remoteId);
      attachedTrackIdsRef.current.delete(remoteId);
      trackEndedAtRef.current.delete(remoteId);
      peerLastConnectedAtRef.current.delete(remoteId);
      reconnectPendingRef.current.delete(remoteId);
      lastHealActionAtRef.current.delete(remoteId);
      if (preserveRemoteAudio) {
        preserveRemoteAudioUntilRef.current.set(
          remoteId,
          Date.now() + PRESERVE_REMOTE_AUDIO_WINDOW_MS
        );
      } else {
        preserveRemoteAudioUntilRef.current.delete(remoteId);
        peerSignalTimestampsRef.current.delete(remoteId);
        remotePlaybackHealthRef.current.delete(remoteId);
      }
      peerMetaRef.current.delete(remoteId);
      peerIceDiagnosticsRef.current.delete(remoteId);
      peerIcePolicyRef.current.delete(remoteId);
      oneWayAudioLoggedRef.current.forEach((key) => {
        if (key === remoteId || key.startsWith(`${remoteId}:`)) {
          oneWayAudioLoggedRef.current.delete(key);
        }
      });
      peerIceConnectedAtRef.current.delete(remoteId);
      audioDiagLogAtRef.current.delete(remoteId);
      audioStrictRecoveryAttemptedRef.current.delete(remoteId);
      resetPeerAudioDiagnostics(remoteId);
      resetVoicePeerPairDiag(remoteId);
      checkingPlaybackStuckAtRef.current.delete(remoteId);
      p2pNoRelayRetryAttemptsRef.current.delete(remoteId);
      p2pNoRelayRetryInFlightRef.current.delete(remoteId);
      p2pNoRelaySelectedPairRef.current.delete(remoteId);
      p2pRetryExhaustedRef.current.delete(remoteId);
      p2pBackgroundRetryCycleRef.current.delete(remoteId);
      const p2pRetryFollowup = p2pNoRelayRetryFollowupTimersRef.current.get(remoteId);
      if (p2pRetryFollowup) {
        window.clearTimeout(p2pRetryFollowup);
        p2pNoRelayRetryFollowupTimersRef.current.delete(remoteId);
      }
      const p2pBackgroundRetry = p2pRetryBackgroundTimersRef.current.get(remoteId);
      if (p2pBackgroundRetry) {
        window.clearTimeout(p2pBackgroundRetry);
        p2pRetryBackgroundTimersRef.current.delete(remoteId);
      }
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
      passiveReconnectStateRef.current.delete(remoteId);

      if (preserveRemoteAudio && prevPeerState === "connected") {
        peerStatesRef.current.set(remoteId, "connected");
      } else {
        peerStatesRef.current.delete(remoteId);
      }
      emitPeerStates();

      const compact =
        `[voice-peer] close remote=${compactDeviceId(remoteId)} reason=${reason} caller=${caller} ` +
        `hadPc=${hadPc} preserveAudio=${preserveRemoteAudio} clearConnId=${shouldClearConnectionId} ` +
        `hadPlaybackEvidence=${playbackEvidence.hasPlaybackEvidence ? 1 : 0} ` +
        `hadAudioConfirmedStrict=${playbackEvidence.audioConfirmedStrict ? 1 : 0} ` +
        `${formatVoiceModeSuffix()}`;

      debugConsoleLog(compact);
      markVoicePeerClose(remoteId, reason);
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

      return true;
    },
    [
      cancelConnectedAudioConfirmTimer,
      clearDeferredMemberCloseTimer,
      clearEndedRemoteAudio,
      clearPeerWatchdogTimers,
      clearReconnectTimer,
      clearCurrentConnectionId,
      emitPeerStates,
      getPlaybackEstablishedEvidence,
      getPeerAnswerWaitState,
      hasLiveRemoteAudioStream,
      hasStaleEndedRemoteAudio,
      shouldHoldCloseForReconnectClearEnded,
    ]
  );

  const maybeClosePeerForMemberRemoval = useCallback(
    (remoteId: string, source: string) => {
      const strict = getStrictRemoteIds();
      const decision = shouldCloseRemotePeerNow(
        remoteId,
        strict,
        remotePeerGraceRefsRef.current
      );

      const evidence = getClosePeerEvidence(
        remoteId,
        remotePeerGraceRefsRef.current,
        membersRef.current
      );

      if (!decision.closeNow) {
        debugConsoleLog(
          `[voice-peer] close-deferred remote=${compactDeviceId(remoteId)} source=${source} ` +
            `graceRemainingMs=${decision.graceRemainingMs} via=${decision.via} ` +
            `presence=${evidence.lastPresenceState} missingForMs=${evidence.missingForMs ?? "-"}`
        );
        if (!deferredMemberCloseTimersRef.current.has(remoteId)) {
          const timer = window.setTimeout(() => {
            deferredMemberCloseTimersRef.current.delete(remoteId);
            const strictNow = getStrictRemoteIds();
            const later = shouldCloseRemotePeerNow(
              remoteId,
              strictNow,
              remotePeerGraceRefsRef.current
            );
            if (later.closeNow && !strictNow.includes(remoteId)) {
              closePeer(remoteId, {
                clearConnectionId: true,
                reason: "member_removed_grace_expired",
              });
            }
          }, decision.graceRemainingMs);
          deferredMemberCloseTimersRef.current.set(remoteId, timer);
        }
        return;
      }

      const closeReason =
        decision.via === "explicit"
          ? "explicit_remote_leave"
          : decision.via === "grace_expired"
            ? "member_removed_grace_expired"
            : "member_removed";

      debugConsoleLog(
        `[voice-peer] close-allowed remote=${compactDeviceId(remoteId)} source=${source} ` +
          `reason=${closeReason} via=${decision.via} explicit=${evidence.explicitLeaveSignalSeen}`
      );

      closePeer(remoteId, {
        clearConnectionId: true,
        reason: closeReason,
      });
    },
    [closePeer, getStrictRemoteIds]
  );

  const attemptSignalingRecoverRef = useRef<
    (remoteId: string, source: string) => Promise<boolean>
  >(async () => false);
  const maybeSoftRenegotiatePeerRef = useRef<
    (remoteId: string) => Promise<boolean>
  >(async () => false);
  const attemptIceRestartRef = useRef<
    (remoteId: string) => Promise<boolean>
  >(async () => false);
  const p2pNoRelayRetryAttemptsRef = useRef<Map<string, number>>(new Map());
  const p2pNoRelayRetryInFlightRef = useRef<Set<string>>(new Set());
  const p2pNoRelayRetryFollowupTimersRef = useRef<Map<string, number>>(new Map());
  const p2pRetryBackgroundTimersRef = useRef<Map<string, number>>(new Map());
  const p2pBackgroundRetryCycleRef = useRef<Map<string, number>>(new Map());
  const p2pRetryExhaustedRef = useRef<Set<string>>(new Set());
  const p2pNoRelaySelectedPairRef = useRef<
    Map<string, VoiceIceCandidatePairSnapshot>
  >(new Map());

  const runP2pNoRelayRetryPhaseRef = useRef<
    (
      remoteId: string,
      pc: RTCPeerConnection,
      context: string
    ) => Promise<boolean>
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

      const decisionInputEarly = buildReconnectDecisionInput(
        remoteId,
        reasonRaw,
        sourceRaw,
        { callerHint, force: opts.force }
      );

      if (isPeerEstablishedForRecovery(remoteId, pcEarly)) {
        logVoiceReconnectDecision("voice-reconnect-blocked", {
          ...decisionInputEarly,
          allow: false,
          blockReason: "p2p_established_recovery",
        });
        return false;
      }

      const answerWait = getPeerAnswerWaitState(remoteId);
      if (
        answerWait.awaiting &&
        reasonRaw !== "answer_wait_timeout" &&
        sourceRaw !== "answer_wait_timeout"
      ) {
        debugConsoleLog(
          `[voice-peer] reconnect-blocked-awaiting-answer remote=${compactDeviceId(remoteId)} ` +
            `reason=${reasonRaw} source=${sourceRaw} callerHint=${callerHint} ` +
            `connectionId=${compactConnectionId(answerWait.connectionId)} ` +
            `currentConnectionId=${compactConnectionId(answerWait.currentConnectionId)} ` +
            `elapsedMs=${answerWait.elapsedMs} remainingMs=${answerWait.remainingMs} ` +
            `sig=${answerWait.signalingState}`
        );
        logVoiceReconnectDecision("voice-reconnect-blocked", {
          ...decisionInputEarly,
          allow: false,
          blockReason: "awaiting_remote_answer",
        });
        return false;
      }

      if (
        reasonRaw === "connected_no_audio_confirm" ||
        sourceRaw === "connected_audio_confirm_timeout"
      ) {
        if (hasRemotePlaybackEvidence(remoteId)) {
          debugConsoleLog(
            `[voice-audio-confirm] reconnect-suppressed remote=${compactDeviceId(remoteId)} ` +
              `reason=playback_evidence_present`
          );
          return false;
        }
        if (
          isRemoteMediaTransportReady(remoteId, pcEarly) &&
          (connectedAudioConfirmGraceRef.current.get(remoteId) ?? 0) < 1
        ) {
          debugConsoleLog(
            `[voice-audio-confirm] reconnect-suppressed remote=${compactDeviceId(remoteId)} ` +
              `reason=awaiting_playback_grace`
          );
          return false;
        }
      }

      if (
        shouldSuppressTransportDisconnectReconnect(
          remoteId,
          reasonRaw,
          pcEarly,
          "schedule_early"
        )
      ) {
        return false;
      }

      const playbackBlockEarly = buildVoicePlaybackBlockReason(decisionInputEarly);
      if (playbackBlockEarly && !opts.force) {
        logVoiceReconnectDecision("voice-reconnect-blocked", {
          ...decisionInputEarly,
          allow: false,
          blockReason: playbackBlockEarly,
        });
        return false;
      }

      const source = sourceRaw;
      let reason = reasonRaw;

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
          debugConsoleLog(
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
          p2pDirectFailedSignalAtRef.current.set(remoteId, Date.now());
          const pcForRetry = pcsRef.current.get(remoteId);
          if (pcForRetry && isPeerEligibleForP2pIceRetry(remoteId, pcForRetry)) {
            void runP2pNoRelayRetryPhaseRef.current(
              remoteId,
              pcForRetry,
              `reconnect_${source}`
            );
          } else if (!p2pEnabledRef.current || !turnFallbackEnabledRef.current) {
            logP2pRetryOnly(remoteId, `reconnect_${source}`);
          } else {
            void attemptTurnFallbackForPeerRef.current(
              remoteId,
              transportFailed
                ? "failed_with_host_srflx_only"
                : "host_srflx_checking_stuck"
            );
          }
        }
      }

      if (!opts.force && reconnectPendingRef.current.has(remoteId)) {
        const existing = reconnectPendingRef.current.get(remoteId)!;
        if (isUnspecifiedReconnectLabel(existing.reason)) {
          debugConsoleLog(
            `[voice-peer] reconnect-cancel-unspecified remote=${compactDeviceId(remoteId)} ` +
              `newReason=${reason} newSource=${source} existingReason=${existing.reason} ${formatVoiceModeSuffix()}`
          );
          clearReconnectTimer(remoteId);
          reconnectPendingRef.current.delete(remoteId);
        } else {
          debugConsoleLog(
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

      if (
        reason === "connected_no_audio_confirm" ||
        source === "connected_audio_confirm_timeout"
      ) {
        debugConsoleLog(
          `[voice-audio-confirm] reconnect-scheduled remote=${compactDeviceId(remoteId)} ` +
            `reason=${reason} source=${source} delayMs=${delay} force=${opts.force ? 1 : 0}`
        );
        logVoiceNegotiationGap(remoteId, `reconnect_${reason}`);
      }

      logVoiceReconnectDecision("voice-reconnect-decision", {
        ...buildReconnectDecisionInput(remoteId, reason, source, {
          callerHint,
          force: opts.force,
        }),
        allow: true,
      });

      debugConsoleLog(
        `[voice-peer] reconnect-scheduled target=${compactDeviceId(remoteId)} reason=${reason} source=${source} delayMs=${delay} owner=${deviceId < remoteId} ` +
          `otherPeers=${buildPeerScopeSnapshot(pcsRef.current, getPeerMedia, remoteId)} ${formatVoiceModeSuffix()}`
      );
      logVoicePeerAutoRecover({
        remoteId,
        action: "reconnect",
        reason,
      });

      const timer = window.setTimeout(() => {
        reconnectTimersRef.current.delete(remoteId);
        reconnectPendingRef.current.delete(remoteId);

        const fireInput = buildReconnectDecisionInput(remoteId, reason, source, {
          force: opts.force,
        });
        const fireBlock = buildVoicePlaybackBlockReason(fireInput);
        if (fireBlock && !opts.force) {
          logVoiceReconnectDecision("voice-reconnect-fire-check", {
            ...fireInput,
            allow: false,
            blockReason: fireBlock,
          });
          return;
        }
        if (isPeerEstablishedForRecovery(remoteId, pcsRef.current.get(remoteId))) {
          logVoiceReconnectDecision("voice-reconnect-fire-check", {
            ...fireInput,
            allow: false,
            blockReason: "p2p_established_recovery",
          });
          return;
        }

        if (
          shouldSuppressTransportDisconnectReconnect(
            remoteId,
            reason,
            pcsRef.current.get(remoteId),
            "reconnect_fire"
          )
        ) {
          logVoiceReconnectDecision("voice-reconnect-fire-check", {
            ...fireInput,
            allow: false,
            blockReason: "ice_transport_suppressed",
          });
          return;
        }

        logVoiceReconnectDecision("voice-reconnect-fire-check", {
          ...fireInput,
          allow: true,
        });

        const nextConnectionId = makeConnectionId(deviceId, remoteId);
        debugConsoleLog(
          `[voice-peer] reconnect-fire remote=${compactDeviceId(remoteId)} reason=${reason} source=${source} beforeClose pc=${!!pcsRef.current.get(remoteId)}`
        );

        const closed = closePeer(remoteId, {
          clearConnectionId: false,
          preserveRemoteAudio: hasLiveRemoteAudioStream(remoteId),
          reason,
          caller: "scheduleReconnect",
        });
        if (!closed) {
          return;
        }
        debugConsoleLog(
          `[voice-peer] track-ended-chain remote=${compactDeviceId(remoteId)} step=close reason=${reason} pc=${isUsablePeerConnection(pcsRef.current.get(remoteId))} ${formatVoiceModeSuffix()}`
        );
        assignConnectionId(remoteId, nextConnectionId, `reconnect_${reason}`);
        connectStartedAtRef.current.set(remoteId, Date.now());

        const ok =
          ensurePeerConnectionRef.current?.(remoteId, `reconnect_${reason}`, {
            force: true,
          }) ?? false;

        debugConsoleLog(
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
      hasLiveRemoteAudioStream,
      localAudioTrackRef,
      localStreamRef,
      assignConnectionId,
      markRecoveryStart,
      micReady,
      getPeerAnswerWaitState,
      getPeerMedia,
      hasRemotePlaybackEvidence,
      isPeerEstablishedForRecovery,
      isPeerEligibleForP2pIceRetry,
      isRemoteMediaTransportReady,
      logP2pRetryOnly,
      buildReconnectDecisionInput,
      buildVoicePlaybackBlockReason,
      logVoiceReconnectDecision,
      shouldSuppressTransportDisconnectReconnect,
    ]
  );

  const fireConnectedAudioConfirmTimeout = useCallback(
    (
      remoteId: string,
      phase: "initial" | "extended",
      audioConfirmTimeoutMs: number
    ) => {
      connectedAudioConfirmTimersRef.current.delete(remoteId);
      const currentPc = pcsRef.current.get(remoteId);
      if (!currentPc) return;
      if (isPeerEstablishedForRecovery(remoteId, currentPc)) return;
      if (hasRemotePlaybackEvidence(remoteId)) {
        debugConsoleLog(
          `[voice-audio-confirm] timeout-suppressed remote=${compactDeviceId(remoteId)} ` +
            `reason=playback_evidence phase=${phase}`
        );
        return;
      }

      const fireMarks = getPeerPipelineMarks(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      logVoiceAudioConfirmTimer({
        remoteId,
        phase: "fire",
        timeoutMs:
          phase === "extended"
            ? CONNECTED_AUDIO_CONFIRM_PLAYBACK_GRACE_MS
            : audioConfirmTimeoutMs,
        sig: currentPc.signalingState,
        conn: currentPc.connectionState,
        ice: currentPc.iceConnectionState,
        tracks: getPeerMedia(remoteId).remoteTracksCount,
        ontrack: timestamps.lastOnTrackAt != null,
        offerSent: fireMarks.offer_sent,
        offerReceived: fireMarks.offer_received,
        answerSent: fireMarks.answer_sent,
        answerReceived: fireMarks.answer_received,
      });

      if (
        isRemoteMediaTransportReady(remoteId, currentPc) &&
        phase === "initial"
      ) {
        connectedAudioConfirmGraceRef.current.set(remoteId, 1);
        ensureRemoteAudioMountedRef.current(
          remoteId,
          "audio_confirm_playback_grace"
        );
        triggerRemoteAudioReplayRef.current(
          remoteId,
          "audio_confirm_playback_grace"
        );
        logVoiceAudioConfirmTimer({
          remoteId,
          phase: "arm",
          timeoutMs: CONNECTED_AUDIO_CONFIRM_PLAYBACK_GRACE_MS,
          sig: currentPc.signalingState,
          conn: currentPc.connectionState,
          ice: currentPc.iceConnectionState,
          tracks: getPeerMedia(remoteId).remoteTracksCount,
          ontrack: timestamps.lastOnTrackAt != null,
          offerSent: fireMarks.offer_sent,
          offerReceived: fireMarks.offer_received,
          answerSent: fireMarks.answer_sent,
          answerReceived: fireMarks.answer_received,
        });
        const graceTimer = window.setTimeout(() => {
          fireConnectedAudioConfirmTimeout(
            remoteId,
            "extended",
            audioConfirmTimeoutMs
          );
        }, CONNECTED_AUDIO_CONFIRM_PLAYBACK_GRACE_MS);
        connectedAudioConfirmTimersRef.current.set(remoteId, graceTimer);
        debugConsoleLog(
          `[voice-audio-confirm] grace-extended remote=${compactDeviceId(remoteId)} ` +
            `ms=${CONNECTED_AUDIO_CONFIRM_PLAYBACK_GRACE_MS} tracks=${getPeerMedia(remoteId).remoteTracksCount}`
        );
        return;
      }

      logVoiceNegotiationGap(remoteId, "connected_audio_confirm_timeout");
      if (
        p2pEnabledRef.current &&
        turnFallbackEnabledRef.current &&
        voiceRouteRef.current === "stun"
      ) {
        void attemptTurnFallbackForPeerRef.current(
          remoteId,
          "connected_audio_confirm_timeout"
        );
        return;
      }

      if (phase === "extended") {
        ensureRemoteAudioMountedRef.current(
          remoteId,
          "audio_confirm_extended_recovery"
        );
        triggerRemoteAudioReplayRef.current(
          remoteId,
          "audio_confirm_extended_recovery"
        );
        void maybeSoftRenegotiatePeerRef
          .current(remoteId)
          .then((softOk) => {
            if (softOk) return;
            if (hasRemotePlaybackEvidence(remoteId)) return;
            return attemptSignalingRecoverRef.current(
              remoteId,
              "connected_audio_confirm_timeout"
            );
          })
          .finally(() => {
            if (hasRemotePlaybackEvidence(remoteId)) return;
            if (reconnectPendingRef.current.has(remoteId)) return;
            if (!relayForcedRef.current) return;
            scheduleReconnect(remoteId, 1200, {
              reason: "connected_no_audio_confirm",
              source: "connected_audio_confirm_timeout",
              force: false,
            });
          });
        return;
      }

      if (relayForcedRef.current) {
        logVoiceAudioConfirmTimer({
          remoteId,
          phase: "reconnect_scheduled",
          timeoutMs: audioConfirmTimeoutMs,
          sig: currentPc.signalingState,
          conn: currentPc.connectionState,
          ice: currentPc.iceConnectionState,
          tracks: getPeerMedia(remoteId).remoteTracksCount,
          ontrack: timestamps.lastOnTrackAt != null,
          offerSent: fireMarks.offer_sent,
          offerReceived: fireMarks.offer_received,
          answerSent: fireMarks.answer_sent,
          answerReceived: fireMarks.answer_received,
        });
        scheduleReconnect(remoteId, 1200, {
          reason: "connected_no_audio_confirm",
          source: "connected_audio_confirm_timeout",
          force: false,
        });
      }
    },
    [
      getPeerMedia,
      hasRemotePlaybackEvidence,
      isPeerEstablishedForRecovery,
      isRemoteMediaTransportReady,
      scheduleReconnect,
    ]
  );

  const armConnectedAudioConfirm = useCallback(
    (remoteId: string, triggerReason: string) => {
      const pc = pcsRef.current.get(remoteId);
      if (!pc) {
        debugConsoleLog(
          `[voice-audio-confirm] phase=arm-skipped remote=${compactDeviceId(remoteId)} ` +
            `reason=no_pc trigger=${triggerReason}`
        );
        return;
      }

      if (hasRemotePlaybackEvidence(remoteId)) {
        cancelConnectedAudioConfirmTimer(remoteId, "already_confirmed", pc);
        return;
      }

      const prevAudioConfirmTimer =
        connectedAudioConfirmTimersRef.current.get(remoteId);
      if (prevAudioConfirmTimer) {
        const armedAt =
          connectedAudioConfirmArmedAtRef.current.get(remoteId) ?? 0;
        const armAgeMs = armedAt > 0 ? Date.now() - armedAt : Infinity;
        if (armAgeMs < AUDIO_CONFIRM_REARM_DEDUPE_MS) {
          logVoiceAudioConfirmTimer({
            remoteId,
            phase: "arm",
            reason:
              triggerReason === "pc_connected"
                ? "skipped_duplicate_connected"
                : `skipped_duplicate_${triggerReason}`,
            sig: pc.signalingState,
            conn: pc.connectionState,
            ice: pc.iceConnectionState,
          });
          return;
        }
        cancelConnectedAudioConfirmTimer(remoteId, "reconnected_pc", pc);
      }

      const audioConfirmTimeoutMs =
        getConnectedAudioConfirmTimeoutMs(inCallMemberCount);
      const marks = getPeerPipelineMarks(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();

      logVoiceAudioConfirmTimer({
        remoteId,
        phase: "arm",
        reason: triggerReason,
        timeoutMs: audioConfirmTimeoutMs,
        sig: pc.signalingState,
        conn: pc.connectionState,
        ice: pc.iceConnectionState,
        tracks: getPeerMedia(remoteId).remoteTracksCount,
        ontrack:
          timestamps.lastOnTrackAt != null || marks.remote_track_received,
        offerSent: marks.offer_sent,
        offerReceived: marks.offer_received,
        answerSent: marks.answer_sent,
        answerReceived: marks.answer_received,
      });
      connectedAudioConfirmArmedAtRef.current.set(remoteId, Date.now());

      const timer = window.setTimeout(() => {
        fireConnectedAudioConfirmTimeout(
          remoteId,
          "initial",
          audioConfirmTimeoutMs
        );
      }, audioConfirmTimeoutMs);
      connectedAudioConfirmTimersRef.current.set(remoteId, timer);
    },
    [
      cancelConnectedAudioConfirmTimer,
      fireConnectedAudioConfirmTimeout,
      getPeerMedia,
      hasRemotePlaybackEvidence,
      inCallMemberCount,
    ]
  );

  useEffect(() => {
    armConnectedAudioConfirmRef.current = armConnectedAudioConfirm;
  }, [armConnectedAudioConfirm]);

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
        debugConsoleLog(
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

        debugConsoleLog(
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

        debugConsoleLog(
          `[voice-peer] track-ended-chain remote=${compactDeviceId(remoteId)} step=schedule reconnect=${reconnectScheduled} delayMs=${voicePolicy.trackEndedReconnectMs} ${formatVoiceModeSuffix()}`
        );

        if (!reconnectScheduled && voicePolicy.trackEndedImmediateEnsure) {
          const ok =
            ensurePeerConnectionRef.current?.(remoteId, "track_ended_immediate", {
              force: true,
            }) ?? false;
          debugConsoleLog(
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
            debugConsoleLog(
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
        p2pDirectFailedSignalAtRef.current.set(remoteId, Date.now());
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
        void (async () => {
        iceCheckingTimersRef.current.delete(remoteId);

        const activeConnectionId = getCurrentConnectionId(remoteId);
        if (!activeConnectionId || activeConnectionId !== connectionId) return;

        const currentPc = pcsRef.current.get(remoteId);
        if (!currentPc || currentPc !== pc) return;

        if (currentPc.iceConnectionState !== "checking") return;

        logIceCheckingDiagnostics(remoteId, currentPc);

        if (isPeerEstablishedForRecovery(remoteId, currentPc)) {
          return;
        }

        if (isPeerEligibleForP2pIceRetry(remoteId, currentPc)) {
          const retryActive = await runP2pNoRelayRetryPhaseRef.current(
            remoteId,
            currentPc,
            "checking_timeout"
          );
          if (retryActive) return;
        } else {
          const stats = getOrCreatePeerIceStats(remoteId);
          if (hasNoRelayCandidates(stats) && !turnFallbackEnabledRef.current) {
            logP2pRetryOnly(remoteId, "checking_timeout");
          }
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
        })();
      }, getIceCheckingDiagnosticsMs(inCallMemberCount));

      iceCheckingTimersRef.current.set(remoteId, timer);
    },
    [
      deviceId,
      emitMeshSummary,
      getCurrentConnectionId,
      getPeerMedia,
      hasLiveRemoteAudioStream,
      isEligibleForIceRestart,
      logIceCheckingDiagnostics,
      getOrCreatePeerIceStats,
      markRecoveryStart,
      sessionId,
      setPeerMeta,
      isPeerEstablishedForRecovery,
      isPeerEligibleForP2pIceRetry,
      logP2pRetryOnly,
      inCallMemberCount,
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

        if (isPeerEligibleForP2pIceRetry(remoteId, currentPc)) {
          void runP2pNoRelayRetryPhaseRef
            .current(remoteId, currentPc, "ice_restart_checking_stuck")
            .then((retryActive) => {
              if (retryActive) return;

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

        const timestamps =
          peerSignalTimestampsRef.current.get(remoteId) ??
          emptyPeerSignalTimestamps();
        const waitCheck = getLiveStreamWaitConnectedCheckForPeer({
          pc: currentPc,
          hasLiveRemoteStream: hasLiveRemoteAudioStream(remoteId),
          remoteTracksCount: getPeerMedia(remoteId).remoteTracksCount,
          hasRemoteStream: getPeerMedia(remoteId).hasRemoteStream,
          timestamps,
          connectStartedAt: connectStartedAtRef.current.get(remoteId),
        });

        if (
          waitCheck?.shouldHold &&
          waitCheck.holdReason === "active_playback_wait_connected"
        ) {
          void maybeSoftRenegotiatePeerRef.current(remoteId);
          return;
        }

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
    [
      deviceId,
      getCurrentConnectionId,
      getPeerMedia,
      hasLiveRemoteAudioStream,
      markRecoveryStart,
      sessionId,
      setPeerMeta,
      emitMeshSummary,
    ]
  );

  useEffect(() => {
    turnFallbackEnabledRef.current = turnFallbackEnabled;
  }, [turnFallbackEnabled]);

  const enableTurnFallback = useCallback(async (opts?: { initial?: boolean }) => {
    if (!turnFallbackEnabledRef.current) return false;
    if (voiceRouteRef.current === "turn") return true;

    const cachedTurn = getCachedTurnIceServers(sessionIdRef.current);
    if (cachedTurn && cachedTurn.length > 0) {
      turnIceServersRef.current = cachedTurn;
      turnProviderRef.current =
        getCachedTurnProvider(sessionIdRef.current) ?? "static";
      voiceRouteRef.current = "turn";
      iceServersRef.current = cachedTurn;
      markVoicePerf("turn_ice_servers_loaded", {
        extra: `provider=${turnProviderRef.current} count=${cachedTurn.length} cached=true`,
      });
      bumpTurnReadyTick("turn_cache");
      return true;
    }

    if (turnIceServersRef.current && turnIceServersRef.current.length > 0) {
      voiceRouteRef.current = "turn";
      iceServersRef.current = turnIceServersRef.current;
      if (opts?.initial) {
        debugConsoleLog(
          `[turn] initial-relay-enabled provider=${turnProviderRef.current ?? "static"} ` +
            `iceServersCount=${turnIceServersRef.current.length}`
        );
      }
      bumpTurnReadyTick("turn_memory");
      return true;
    }

    if (loadingTurnRef.current) return false;

    loadingTurnRef.current = true;

    if (opts?.initial) {
      debugConsoleLog("[turn] initial-relay-start provider=static");
    }

    try {
      const res = await fetchWithRetry(
        "/api/turn",
        {
          method: "GET",
          cache: "no-store",
        },
        { kind: "turn", maxAttempts: 3 }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const apiError =
          typeof data?.error === "string" ? data.error : `http_${res.status}`;
        console.warn(
          `[turn] api-error status=${res.status} error=${apiError} ${formatVoiceModeSuffix()}`
        );
        return false;
      }

      const provider =
        typeof data?.provider === "string" ? data.provider : "unknown";
      turnProviderRef.current = provider;

      const nextIceServers = Array.isArray(data?.ice_servers)
        ? data.ice_servers
        : Array.isArray(data?.iceServers)
          ? data.iceServers
          : null;

      if (nextIceServers && nextIceServers.length > 0) {
        debugConsoleLog(
          `[turn] api-response provider=${provider} iceServersCount=${nextIceServers.length}`
        );
        turnIceServersRef.current = nextIceServers;
        voiceRouteRef.current = "turn";
        iceServersRef.current = nextIceServers;
        setCachedTurnIceServers(
          sessionIdRef.current,
          nextIceServers,
          provider
        );
        if (opts?.initial) {
          debugConsoleLog(
            `[turn] initial-relay-enabled provider=${provider} iceServersCount=${nextIceServers.length}`
          );
        }
        markVoicePerf("turn_ice_servers_loaded", {
          extra: `provider=${provider} count=${nextIceServers.length} cached=false`,
        });
        bumpTurnReadyTick("turn_api");
        return true;
      }

      console.warn(
        `[call] TURN response has no ice_servers provider=${provider}`,
        data
      );
      return false;
    } catch (e) {
      console.warn("[call] TURN load failed", e);
      return false;
    } finally {
      loadingTurnRef.current = false;
    }
  }, [bumpTurnReadyTick]);

  const attemptTurnFallbackForPeer = useCallback(
    async (remoteId: string, turnReason = "host_srflx_checking_stuck") => {
      if (!p2pEnabledRef.current || !turnFallbackEnabledRef.current) {
        logP2pRetryOnly(remoteId, `turn_fallback_${turnReason}`);
        return false;
      }

      if (isPeerEstablishedForRecovery(remoteId)) {
        return false;
      }

      if (turnFallbackAttemptedRef.current.get(remoteId)) {
        return false;
      }

      const stats = getOrCreatePeerIceStats(remoteId);
      const bypassNoRelayCheck =
        turnReason === "connected_no_actual_audio" ||
        turnReason === "connected_audio_confirm_timeout";
      if (!bypassNoRelayCheck && !hasNoRelayCandidates(stats)) {
        return false;
      }

      debugConsoleLog(
        `[voice-peer] turn-fallback-needed remote=${compactDeviceId(remoteId)} ` +
          `reason=${turnReason} enabled=${turnFallbackEnabledRef.current} ${formatVoiceModeSuffix()}`
      );

      turnFallbackAttemptedRef.current.set(remoteId, true);
      const ok = await enableTurnFallback();
      const turnProvider = turnProviderRef.current ?? "unknown";
      if (!ok) {
        turnFallbackAttemptedRef.current.delete(remoteId);
        console.warn(
          `[voice-peer] turn-fallback-failed remote=${compactDeviceId(remoteId)} ` +
            `provider=${turnProvider} ${formatVoiceModeSuffix()}`
        );
        return false;
      }

      debugConsoleLog(
        `[voice-peer] turn-fallback-start remote=${compactDeviceId(remoteId)} ` +
          `reason=${turnReason} provider=${turnProvider} ${formatVoiceModeSuffix()}`
      );

      debugConsoleLog(
        `[voice-peer] turn-fallback-enabled remote=${compactDeviceId(remoteId)} ` +
          `provider=${turnProvider} ${formatVoiceModeSuffix()}`
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
      isPeerEstablishedForRecovery,
      logP2pRetryOnly,
    ]
  );

  const createPeerConnection = useCallback(
    (remoteId: string, connectionId: string, opts?: VoicePeerCreateOpts) => {
      const caller = opts?.caller ?? "unknown";
      const mutationReason = opts?.reason ?? "unspecified";
      const existing = pcsRef.current.get(remoteId);
      const currentId = getCurrentConnectionId(remoteId);
      const role = deviceId < remoteId ? "active" : "passive";
      const playbackEvidence = getPlaybackEstablishedEvidence(remoteId);
      const mutationBlock = evaluateVoicePeerMutationBlock({
        kind: "create",
        evidence: playbackEvidence,
        ctx: {
          reason: mutationReason,
          caller,
          force: opts?.force,
          manualHealPass: manualHardResetHealPassRef.current.has(remoteId),
        },
      });
      const blockedByPlaybackEvidence =
        mutationBlock.blocked &&
        !opts?.force &&
        !manualHardResetHealPassRef.current.has(remoteId);

      if (existing && currentId === connectionId) {
        return existing;
      }

      if (blockedByPlaybackEvidence) {
        console.warn(
          `[voice-peer] create-blocked-playback remote=${compactDeviceId(remoteId)} role=${role} ` +
            `reason=${mutationReason} caller=${caller} blockedByPlaybackEvidence=1 ` +
            `hadPlaybackEvidence=${playbackEvidence.hasPlaybackEvidence ? 1 : 0} ` +
            `hadAudioConfirmedStrict=${playbackEvidence.audioConfirmedStrict ? 1 : 0} ` +
            `${formatVoiceModeSuffix()}`
        );
        return existing && isUsablePeerConnection(existing) ? existing : null;
      }

      if (existing && currentId !== connectionId) {
        if (shouldRejectIncomingStaleOffer(remoteId, connectionId, existing)) {
          debugConsoleLog(
            `[voice-peer] stale-offer-rejected remote=${compactDeviceId(remoteId)} ` +
              `current=${compactConnectionId(currentId)} incoming=${compactConnectionId(connectionId)} ${formatVoiceModeSuffix()}`
          );
          return existing;
        }

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

        logVoicePeerCompetition({
          remoteId,
          action: "create_pc_replace",
          reason: "connection_id_mismatch",
          role,
          connectionId,
          existingConnectionId: currentId,
          sig: existing.signalingState,
          conn: existing.connectionState,
        });
        const closed = closePeer(remoteId, {
          ...CLOSE_FOR_RECONNECT,
          caller: "createPeerConnection",
          reason: "connection_id_mismatch",
        });
        if (!closed) {
          return existing;
        }
      }

      assignConnectionId(remoteId, connectionId, "create_pc");
      markConnectStart(remoteId);

      const currentIceServers =
        iceServersRef.current.length > 0
          ? iceServersRef.current
          : FALLBACK_ICE_SERVERS;

      const iceTransportPolicy = getPeerIceTransportPolicy();
      peerIcePolicyRef.current.set(remoteId, iceTransportPolicy);

      voiceProdLog(
        `[voice-peer] create remote=${compactDeviceId(remoteId)} role=${role} ` +
          `reason=${mutationReason} caller=${caller} blockedByPlaybackEvidence=0 ` +
          `connectionId=${compactConnectionId(connectionId)} ${formatVoiceModeSuffix()}`
      );
      debugConsoleLog(
        `[voice-peer] create-peer remote=${compactDeviceId(remoteId)} ` +
          `connectionId=${compactConnectionId(connectionId)} ` +
          `policy=${iceTransportPolicy} p2pEnabled=${p2pEnabledRef.current} ` +
          `staticTurn=${turnFallbackEnabledRef.current} voiceRoute=${voiceRouteRef.current} ` +
          `hasTurn=${hasTurnIceServer(currentIceServers)} relayForced=${relayForcedRef.current} ` +
          `settingsReady=${voiceSettingsReadyRef.current}`
      );

      const pc = new RTCPeerConnection({
        iceServers: currentIceServers,
        iceTransportPolicy,
      });
      markVoicePerf("peer_connection_created", { remoteId });

      const localTrack = localAudioTrackRef.current;
      const localStream = localStreamRef.current;

      if (localTrack && localStream) {
        pc.addTrack(localTrack, localStream);

        const sender = pc
          .getSenders()
          .find((s) => s.track?.kind === "audio" || s.track === null);

        if (sender && userMutedRef.current) {
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
        const peerPolicy = peerIcePolicyRef.current.get(remoteId);
        const icePolicy: "relay" | "all" =
          peerPolicy === "relay" || relayForcedRef.current ? "relay" : "all";
        logVoiceIceLocalCandidate({
          remoteId,
          connectionId: activeConnectionId,
          candidate: candidateJson,
          policy: icePolicy,
        });

        void sendSignal(remoteId, "ice", {
          connectionId: activeConnectionId,
          candidate: candidateJson,
        }).then((sent) => {
          if (sent?.ok) {
            logVoiceIceCandidateSent({
              remoteId,
              connectionId: activeConnectionId,
              candidate: candidateJson,
            });
          }
        });
        touchPeerSignal(remoteId, "ice_sent");
        emitMeshSummary("ice_sent");
      };

      pc.ontrack = (event) => {
        if (pcsRef.current.get(remoteId) !== pc) return;
        if (!getCurrentConnectionId(remoteId)) return;

        const stream = event.streams?.[0];
        if (!stream) return;

        const audioTrack = stream.getAudioTracks()[0] ?? null;
        markVoiceNegotiationStep(remoteId, "ontrack", `sig=${pc.signalingState}`);
        logVoiceRemoteTrackReceived({
          remoteId,
          reason: "pc_ontrack",
          trackId: audioTrack?.id,
          streamId: stream.id,
          connectionId: getCurrentConnectionId(remoteId),
          sig: pc.signalingState,
          conn: pc.connectionState,
        });

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
          clearIceDisconnectedGraceTimer(remoteId);
          markVoicePerf("ice_connected", {
            remoteId,
            extra: `ice=${iceState}`,
          });
          markPeerLastConnected(remoteId);
          checkingPlaybackStuckAtRef.current.delete(remoteId);
          p2pNoRelayRetryAttemptsRef.current.delete(remoteId);
          p2pNoRelayRetryInFlightRef.current.delete(remoteId);
          const p2pRetryFollowup = p2pNoRelayRetryFollowupTimersRef.current.get(remoteId);
          if (p2pRetryFollowup) {
            window.clearTimeout(p2pRetryFollowup);
            p2pNoRelayRetryFollowupTimersRef.current.delete(remoteId);
          }
          const p2pBackgroundRetry = p2pRetryBackgroundTimersRef.current.get(remoteId);
          if (p2pBackgroundRetry) {
            window.clearTimeout(p2pBackgroundRetry);
            p2pRetryBackgroundTimersRef.current.delete(remoteId);
          }
          void logVoiceIceCandidatePairFromPc(remoteId, pc).then((pair) => {
            if (pair.route === "p2p") {
              p2pNoRelaySelectedPairRef.current.set(remoteId, pair);
            }
          });
          iceRestartAttemptsRef.current.delete(remoteId);
          softIceRestartAttemptsRef.current.delete(remoteId);
          softRebuildCandidateLoggedRef.current.delete(remoteId);
          p2pDirectFailedHoldUntilRef.current.delete(remoteId);
          orphanRemoteAudioAtRef.current.delete(remoteId);
          if (orphanRemoteAudioRef.current.delete(remoteId)) {
            emitPeerStates();
          }
          orphanRemoteAudioLoggedRef.current.delete(remoteId);
          markIceTransportConfirmed(remoteId, pc);
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

          const suppress = evaluateIceDisconnectedReconnectSuppressReason(
            buildIceDisconnectedGuardInput(remoteId, pc)
          );
          if (suppress) {
            logIceDisconnectedReconnectSuppressed(
              remoteId,
              suppress,
              "ice_state_change"
            );
            return;
          }

          if (iceDisconnectedGraceTimersRef.current.has(remoteId)) {
            return;
          }

          const graceTimer = window.setTimeout(() => {
            iceDisconnectedGraceTimersRef.current.delete(remoteId);
            const currentPc = pcsRef.current.get(remoteId);
            if (!currentPc || currentPc !== pc) return;
            if (!getCurrentConnectionId(remoteId)) return;

            const currentIce = currentPc.iceConnectionState;
            if (currentIce === "connected" || currentIce === "completed") {
              return;
            }
            if (currentIce === "failed") {
              return;
            }
            if (currentIce !== "disconnected") return;

            const graceSuppress = evaluateIceDisconnectedReconnectSuppressReason(
              buildIceDisconnectedGuardInput(remoteId, currentPc)
            );
            if (graceSuppress) {
              logIceDisconnectedReconnectSuppressed(
                remoteId,
                graceSuppress,
                "grace_timeout"
              );
              return;
            }

            debugConsoleLog(
              `[voice-peer] reconnect_ice_disconnected_scheduled remote=${compactDeviceId(remoteId)} ` +
                `graceMs=${ICE_DISCONNECTED_RECONNECT_GRACE_MS} ` +
                `conn=${currentPc.connectionState} ice=${currentIce} ${formatVoiceModeSuffix()}`
            );
            setPeerState(remoteId, "connecting");
            scheduleReconnect(remoteId, 1200, {
              reason: "ice_disconnected",
              source: "pc_oniceconnectionstatechange_grace",
            });
          }, ICE_DISCONNECTED_RECONNECT_GRACE_MS);

          iceDisconnectedGraceTimersRef.current.set(remoteId, graceTimer);
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

          const failedSuppress = evaluateIceDisconnectedReconnectSuppressReason(
            buildIceDisconnectedGuardInput(remoteId, pc)
          );
          if (failedSuppress) {
            logIceDisconnectedReconnectSuppressed(
              remoteId,
              failedSuppress,
              "ice_failed"
            );
            return;
          }

          if (isPeerEligibleForP2pIceRetry(remoteId, pc)) {
            void runP2pNoRelayRetryPhaseRef.current(remoteId, pc, "ice_failed");
            return;
          }

          if (
            voiceRouteRef.current === "stun" &&
            p2pEnabledRef.current &&
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
            p2pEnabledRef.current &&
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
            }, getConnectingTurnProbeMs(inCallMemberCount));
          }
        } else {
          const connectingTimer = connectingTimersRef.current.get(remoteId);
          if (connectingTimer) {
            window.clearTimeout(connectingTimer);
            connectingTimersRef.current.delete(remoteId);
          }
        }

        if (state === "connected") {
          markVoicePerf("peer_connected", { remoteId });
          peerEverConnectedRef.current.add(remoteId);
          peerIceConnectedAtRef.current.set(remoteId, Date.now());
          audioStrictRecoveryAttemptedRef.current.delete(remoteId);
          markPeerLastConnected(remoteId);
          setPeerState(remoteId, "connected");
          clearReconnectTimer(remoteId);
          clearPeerWatchdogTimers(remoteId);
          cancelPassiveWaitOffer(remoteId, "pc_connected");
          maybeLogRecoverySuccess(remoteId, pc);
          syncRemoteAudioFromPc(remoteId, pc, "pc_connected");
          markIceTransportConfirmed(remoteId, pc);

          connectedAudioConfirmGraceRef.current.delete(remoteId);
          armConnectedAudioConfirm(remoteId, "pc_connected");

          const sender = pc
            .getSenders()
            .find((s) => s.track?.kind === "audio" || s.track === null);

          const track = localAudioTrackRef.current;

          if (sender && track) {
            void sender.replaceTrack(userMutedRef.current ? null : track);
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

          const suppress = evaluateIceDisconnectedReconnectSuppressReason(
            buildIceDisconnectedGuardInput(remoteId, pc)
          );
          if (suppress) {
            logPcDisconnectedReconnectSuppressed(
              remoteId,
              suppress,
              "pc_state_change"
            );
            return;
          }

          if (pcDisconnectedGraceTimersRef.current.has(remoteId)) {
            return;
          }

          const graceTimer = window.setTimeout(() => {
            pcDisconnectedGraceTimersRef.current.delete(remoteId);
            const currentPc = pcsRef.current.get(remoteId);
            if (!currentPc || currentPc !== pc) return;
            if (!getCurrentConnectionId(remoteId)) return;

            const currentConn = currentPc.connectionState;
            if (currentConn === "connected") {
              return;
            }
            if (currentConn === "failed" || currentConn === "closed") {
              return;
            }
            if (currentConn !== "disconnected") return;

            const graceSuppress = evaluateIceDisconnectedReconnectSuppressReason(
              buildIceDisconnectedGuardInput(remoteId, currentPc)
            );
            if (graceSuppress) {
              logPcDisconnectedReconnectSuppressed(
                remoteId,
                graceSuppress,
                "grace_timeout"
              );
              return;
            }

            debugConsoleLog(
              `[voice-peer] reconnect_pc_disconnected_scheduled remote=${compactDeviceId(remoteId)} ` +
                `graceMs=${PC_DISCONNECTED_RECONNECT_GRACE_MS} ` +
                `conn=${currentConn} ice=${currentPc.iceConnectionState} ${formatVoiceModeSuffix()}`
            );
            setPeerState(remoteId, "connecting");
            scheduleReconnect(remoteId, 1200, {
              reason: "pc_disconnected",
              source: "pc_onconnectionstatechange_grace",
            });
          }, PC_DISCONNECTED_RECONNECT_GRACE_MS);

          pcDisconnectedGraceTimersRef.current.set(remoteId, graceTimer);
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
            p2pEnabledRef.current &&
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
      armConnectedAudioConfirm,
      buildIceDisconnectedGuardInput,
      cancelConnectedAudioConfirmTimer,
      clearIceDisconnectedGraceTimer,
      clearPeerWatchdogTimers,
      clearReconnectTimer,
      closePeer,
      deviceId,
      enableTurnFallback,
      getCurrentConnectionId,
      getOrCreatePeerIceStats,
      getPeerMedia,
      getPlaybackEstablishedEvidence,
      hasRemotePlaybackEvidence,
      isPeerEstablishedForRecovery,
      isRemoteMediaTransportReady,
      logIceDisconnectedReconnectSuppressed,
      logPcDisconnectedReconnectSuppressed,
      shouldRejectIncomingStaleOffer,
      userMutedRef,
      localAudioTrackRef,
      localStreamRef,
      logVoiceConnection,
      markConnectStart,
      markIceTransportConfirmed,
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
      getPeerIceTransportPolicy,
      cancelPassiveWaitOffer,
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

      if (!force) {
        if (!voiceSettingsReadyRef.current) {
          logVoiceStartBlocked(remoteId, "settings_not_ready");
          return;
        }
        if (!signalReadyRef.current) {
          logVoiceStartBlocked(remoteId, "signal_not_ready");
          return;
        }
        if (
          relayForcedRef.current &&
          !hasTurnIceServer(iceServersRef.current)
        ) {
          logVoiceStartBlocked(remoteId, "turn_not_loaded");
          return;
        }
      }

      if (!canSendVoiceOffer()) {
        logMicOfferBlocked(remoteId);
        return;
      }

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
      cancelPassiveWaitOffer(remoteId, "offer_send");

      let pc: RTCPeerConnection | null | undefined = existingPc;
      if (!isUsablePeerConnection(pc)) {
        pc =
          createPeerConnection(remoteId, connectionId, {
            caller: "startPeerOffer",
            reason,
          }) ?? undefined;
      }

      if (!pc) return;

      if (offeredPeersRef.current.has(remoteId) && !force) return;
      if (pc.signalingState !== "stable") {
        if (!force) return;
        closePeer(remoteId, {
          clearConnectionId: false,
          preserveRemoteAudio: hasLiveRemoteAudioStream(remoteId),
          reason: `force_offer_reset_${reason}`,
          caller: "startPeerOffer",
        });
        if (pcsRef.current.has(remoteId)) return;
        assignConnectionId(remoteId, connectionId, "force_offer_reset");
        pc =
          createPeerConnection(remoteId, connectionId, {
            caller: "startPeerOffer",
            reason: `force_offer_reset_${reason}`,
            force,
          }) ?? undefined;
      }

      if (!pc || pc.signalingState !== "stable") return;

      offeredPeersRef.current.add(remoteId);
      clearReconnectTimer(remoteId);
      setPeerState(remoteId, "connecting");

      debugConsoleLog(
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

        const sendResult = await sendSignal(remoteId, "offer", {
          connectionId,
          sdp: pc.localDescription,
        });
        if (!sendResult.ok) {
          offeredPeersRef.current.delete(remoteId);
          console.warn(
            `[voice-signal] offer-send-failed remote=${compactDeviceId(remoteId)} reason=${reason} ` +
              `connectionId=${compactConnectionId(connectionId)} ` +
              `name=${sendResult.errorName ?? "unknown"} message=${sendResult.errorMessage ?? "unknown"}`
          );
          return;
        }
        voiceProdLog(
          `[voice-signal] offer-send remote=${compactDeviceId(remoteId)} reason=${reason} ` +
            `connectionId=${compactConnectionId(connectionId)} target=${compactDeviceId(remoteId)} sig=${pc.signalingState}`
        );
        markVoiceNegotiationStep(remoteId, "offer_send", `reason=${reason}`);
        touchPeerSignal(remoteId, "offer_sent");
        markVoicePerf("offer_sent", { remoteId, extra: reason });
        scheduleAnswerWaitTimeoutRef.current(remoteId, connectionId, reason);
        emitMeshSummary("offer_sent", { immediate: true });

        if (
          reason === "manual_reconnect" ||
          reason === "auto_hard_reset"
        ) {
          debugConsoleLog(
            `[voice-signal] offer-sent remote=${compactDeviceId(remoteId)} reason=${reason} ` +
              `connectionId=${compactConnectionId(connectionId)} ${formatVoiceModeSuffix()}`
          );
        }

        debugConsoleLog(
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
      cancelPassiveWaitOffer,
      clearNoStreamNoOfferTimer,
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
      canSendVoiceOffer,
      logMicOfferBlocked,
      setPeerState,
      touchPeerSignal,
    ]
  );

  const scheduleAnswerWaitTimeoutRef = useRef<
    (remoteId: string, connectionId: string, reason: string) => void
  >(() => {});

  const scheduleAnswerWaitTimeout = useCallback(
    (remoteId: string, connectionId: string, reason: string) => {
      clearAnswerWaitTimer(remoteId);

      const armedAt = Date.now();
      answerWaitMetaRef.current.set(remoteId, {
        connectionId,
        reason,
        armedAt,
      });

      voiceProdLog(
        `[voice-signal] answer_wait_arm remote=${compactDeviceId(remoteId)} ` +
          `connectionId=${compactConnectionId(connectionId)} ` +
          `currentConnectionId=${compactConnectionId(getCurrentConnectionId(remoteId))} ` +
          `offerReason=${reason} timeoutMs=${ANSWER_WAIT_TIMEOUT_MS} caller=scheduleAnswerWaitTimeout`
      );
      emitReadinessSnapshot("answer_wait_arm");

      const timer = window.setTimeout(() => {
        answerWaitTimersRef.current.delete(remoteId);
        const meta = answerWaitMetaRef.current.get(remoteId);
        answerWaitMetaRef.current.delete(remoteId);
        if (!meta || meta.connectionId !== connectionId) return;

        const pc = pcsRef.current.get(remoteId);
        const marks = getPeerPipelineMarks(remoteId);
        const ageMs = Date.now() - meta.armedAt;
        const currentConnectionId = getCurrentConnectionId(remoteId);

        if (marks.answer_received) return;
        if (pc?.signalingState !== "have-local-offer") return;

        voiceProdLog(
          `[voice-signal] answer_wait_timeout remote=${compactDeviceId(remoteId)} ` +
            `connectionId=${compactConnectionId(connectionId)} currentConnectionId=${compactConnectionId(currentConnectionId)} ` +
            `offerReason=${meta.reason} elapsedMs=${ageMs} sig=${pc.signalingState} ` +
            `conn=${pc.connectionState} ice=${pc.iceConnectionState} ` +
            `answerReceived=${marks.answer_received ? 1 : 0} caller=scheduleAnswerWaitTimeout`
        );
        emitReadinessSnapshot("answer_wait_timeout");

        if (shouldSuppressAutoVoiceRecoveryForPeer(remoteId)) return;

        if (answerWaitRetriedByConnRef.current.get(remoteId) === connectionId) {
          offeredPeersRef.current.delete(remoteId);
          scheduleReconnect(remoteId, 1200, {
            reason: "answer_wait_timeout",
            source: "answer_wait_timeout",
            force: false,
          });
          return;
        }

        answerWaitRetriedByConnRef.current.set(remoteId, connectionId);
        offeredPeersRef.current.delete(remoteId);
        passiveFallbackOfferByConnRef.current.delete(remoteId);
        voiceProdLog(
          `[voice-signal] answer_wait_retry remote=${compactDeviceId(remoteId)} ` +
            `connectionId=${compactConnectionId(connectionId)} currentConnectionId=${compactConnectionId(currentConnectionId)} ` +
            `elapsedMs=${ageMs} sig=${pc.signalingState} caller=scheduleAnswerWaitTimeout`
        );
        void startPeerOffer(remoteId, {
          force: true,
          reason: "answer_wait_timeout_retry",
        });
      }, ANSWER_WAIT_TIMEOUT_MS);

      answerWaitTimersRef.current.set(remoteId, timer);
    },
    [
      clearAnswerWaitTimer,
      emitReadinessSnapshot,
      getCurrentConnectionId,
      getPeerPipelineMarks,
      scheduleReconnect,
      shouldSuppressAutoVoiceRecoveryForPeer,
      startPeerOffer,
    ]
  );

  useEffect(() => {
    scheduleAnswerWaitTimeoutRef.current = scheduleAnswerWaitTimeout;
  }, [scheduleAnswerWaitTimeout]);

  const maybeStartOffer = useCallback(
    async (remoteId: string) => {
      await startPeerOffer(remoteId, { reason: "maybe_start_offer" });
    },
    [startPeerOffer]
  );

  useEffect(() => {
    maybeStartOfferRef.current = startPeerOffer;
  }, [startPeerOffer]);

  const ensurePeerLocalAudioSender = useCallback(
    (remoteId: string, reason: string): boolean => {
      const pc = pcsRef.current.get(remoteId);
      if (!pc || !isUsablePeerConnection(pc)) return false;

      const track = localAudioTrackRef.current;
      const stream = localStreamRef.current;
      if (!track || track.readyState !== "live" || !stream) return false;

      const sendTrack = userMutedRef.current ? null : track;
      let sender = pc
        .getSenders()
        .find((s) => s.track?.kind === "audio" || s.track === null);

      if (!sender) {
        pc.addTrack(track, stream);
        sender = pc
          .getSenders()
          .find((s) => s.track?.kind === "audio" || s.track === null);
        logVoicePeerReplaceTrack(remoteId, sendTrack, `${reason}_add_track`);
      }

      if (sender) {
        void sender.replaceTrack(sendTrack);
        logVoicePeerReplaceTrack(remoteId, sendTrack, reason);
      }

      return !!sender;
    },
    [localAudioTrackRef, localStreamRef, userMutedRef]
  );

  const runPassiveFallbackOffer = useCallback(
    (remoteId: string, triggerReason: string) => {
      if (shouldSuppressAutoVoiceRecoveryForPeer(remoteId)) {
        return;
      }

      if (!canSendVoiceOffer()) {
        logMicOfferBlocked(remoteId);
        return;
      }

      const marks = getPeerPipelineMarks(remoteId);
      if (
        marks.offer_received ||
        marks.remote_track_received ||
        hasLiveRemoteAudioStream(remoteId) ||
        hasRemotePlaybackEvidence(remoteId)
      ) {
        return;
      }

      const connectionId = getCurrentConnectionId(remoteId);
      if (!connectionId) return;

      if (passiveFallbackOfferByConnRef.current.get(remoteId) === connectionId) {
        return;
      }

      const pc = pcsRef.current.get(remoteId);
      if (!pc || hasLiveRemoteAudioStream(remoteId)) return;

      if (
        pc.signalingState === "have-remote-offer" ||
        pc.connectionState === "connected"
      ) {
        return;
      }

      if (pc.signalingState === "have-local-offer") {
        return;
      }

      passiveFallbackOfferByConnRef.current.set(remoteId, connectionId);
      clearNoStreamNoOfferTimer(remoteId);
      cancelPassiveWaitOffer(remoteId, "passive_wait_fallback_offer");

      voiceProdLog(
        `[voice-peer] passive-wait-offer-timeout remote=${compactDeviceId(remoteId)} ` +
          `action=fallback_offer trigger=${triggerReason} ${formatVoiceModeSuffix()}`
      );

      void startPeerOffer(remoteId, {
        force: true,
        reason: "passive_wait_fallback_offer",
      });
    },
    [
      cancelPassiveWaitOffer,
      canSendVoiceOffer,
      clearNoStreamNoOfferTimer,
      getCurrentConnectionId,
      hasLiveRemoteAudioStream,
      hasRemotePlaybackEvidence,
      logMicOfferBlocked,
      shouldSuppressAutoVoiceRecoveryForPeer,
      startPeerOffer,
    ]
  );

  const schedulePassiveWaitOfferTimeout = useCallback(
    (
      remoteId: string,
      triggerReason: string,
      opts?: { forceReschedule?: boolean; initialJoin?: boolean }
    ): boolean => {
      if (deviceId < remoteId) return false;

      if (shouldSuppressAutoVoiceRecoveryForPeer(remoteId)) {
        return false;
      }

      const marks = getPeerPipelineMarks(remoteId);
      if (
        marks.offer_received ||
        marks.remote_track_received ||
        hasLiveRemoteAudioStream(remoteId) ||
        hasRemotePlaybackEvidence(remoteId)
      ) {
        return false;
      }

      const connectionId = getCurrentConnectionId(remoteId);
      if (
        connectionId &&
        passiveFallbackOfferByConnRef.current.get(remoteId) === connectionId
      ) {
        return false;
      }

      const existingPc = pcsRef.current.get(remoteId);
      if (existingPc && isUsablePeerConnection(existingPc)) {
        const phase = getPeerNegotiationPhase(remoteId, existingPc);
        if (shouldSuppressPassiveOfferReschedule(phase)) {
          return false;
        }
      }

      if (!canSendVoiceOffer()) {
        if (!(opts?.initialJoin && deviceId > remoteId)) {
          logMicOfferBlocked(remoteId);
          return false;
        }
      }

      const existingTimer = passiveWaitOfferTimersRef.current.get(remoteId);
      if (existingTimer != null && !opts?.forceReschedule) {
        return false;
      }

      clearPassiveWaitOfferTimer(remoteId);

      const delayMs = opts?.initialJoin
        ? PASSIVE_WAIT_OFFER_INITIAL_MS
        : triggerReason === "mic_ready" ||
            triggerReason === "all_ready" ||
            triggerReason === "settings_turn_signal_ready"
          ? PASSIVE_WAIT_OFFER_MIC_READY_MS
          : PASSIVE_WAIT_OFFER_TIMEOUT_MS;

      logPassiveOfferDeferred({ remoteId, triggerReason, delayMs });

      const timer = window.setTimeout(() => {
        passiveWaitOfferTimersRef.current.delete(remoteId);
        passiveWaitOfferMetaRef.current.delete(remoteId);
        if (shouldSuppressAutoVoiceRecoveryForPeer(remoteId)) {
          return;
        }
        runPassiveFallbackOffer(remoteId, triggerReason);
      }, delayMs);

      passiveWaitOfferTimersRef.current.set(remoteId, timer);
      passiveWaitOfferMetaRef.current.set(remoteId, {
        triggerReason,
        scheduledAt: Date.now(),
        delayMs,
      });
      return true;
    },
    [
      canSendVoiceOffer,
      clearPassiveWaitOfferTimer,
      deviceId,
      getCurrentConnectionId,
      getPeerNegotiationPhase,
      hasLiveRemoteAudioStream,
      hasRemotePlaybackEvidence,
      logMicOfferBlocked,
      runPassiveFallbackOffer,
      shouldSuppressAutoVoiceRecoveryForPeer,
    ]
  );

  const scheduleNoStreamNoOfferTimeout = useCallback(
    (remoteId: string, triggerReason: string) => {
      if (shouldSuppressAutoVoiceRecoveryForPeer(remoteId)) {
        return;
      }

      clearNoStreamNoOfferTimer(remoteId);

      const selfMember = members.find((m) => m.device_id === deviceId);
      const localInCall = isLocalVoiceParticipant(selfMember);
      const remoteInCall = isRemoteInCall(remoteId);
      if (!localInCall || !remoteInCall) return;

      const timer = window.setTimeout(() => {
        noStreamNoOfferTimersRef.current.delete(remoteId);

        if (shouldSuppressAutoVoiceRecoveryForPeer(remoteId)) {
          return;
        }

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

        debugConsoleLog(
          `[voice-peer] no-stream-no-offer-timeout remote=${compactDeviceId(remoteId)} action=force_offer ` +
            `conn=${pc.connectionState} ice=${pc.iceConnectionState} sig=${pc.signalingState} ` +
            `owner=${deviceId < remoteId} trigger=${triggerReason} ${formatVoiceModeSuffix()}`
        );

        void startPeerOffer(remoteId, {
          force: true,
          reason: "no_stream_no_offer_timeout",
        });
      }, NO_STREAM_NO_OFFER_FORCE_MS + getVoiceJoinStabilizationRemainingMs());

      noStreamNoOfferTimersRef.current.set(remoteId, timer);
    },
    [
      clearNoStreamNoOfferTimer,
      deviceId,
      getPeerMedia,
      getVoiceJoinStabilizationRemainingMs,
      hasLiveRemoteAudioStream,
      isRemoteInCall,
      members,
      shouldSuppressAutoVoiceRecoveryForPeer,
      startPeerOffer,
    ]
  );

  const beginPassiveOfferWait = useCallback(
    (
      remoteId: string,
      triggerReason: string,
      opts?: { forceReschedule?: boolean; initialJoin?: boolean }
    ): boolean => {
      if (deviceId < remoteId) return false;

      if (shouldSuppressAutoVoiceRecoveryForPeer(remoteId)) {
        return false;
      }

      const phase = getPeerNegotiationPhase(remoteId);
      if (shouldSuppressPassiveOfferReschedule(phase)) {
        return false;
      }

      passiveJoinSettledRef.current.delete(remoteId);
      ensurePeerLocalAudioSender(remoteId, triggerReason);

      const scheduled = schedulePassiveWaitOfferTimeout(remoteId, triggerReason, opts);
      scheduleNoStreamNoOfferTimeout(remoteId, triggerReason);
      return scheduled;
    },
    [
      deviceId,
      ensurePeerLocalAudioSender,
      getPeerNegotiationPhase,
      scheduleNoStreamNoOfferTimeout,
      schedulePassiveWaitOfferTimeout,
      shouldSuppressAutoVoiceRecoveryForPeer,
    ]
  );

  const clearPassiveReconnectState = useCallback((remoteId: string) => {
    const state = passiveReconnectStateRef.current.get(remoteId);
    if (state?.retryTimerId != null) {
      window.clearTimeout(state.retryTimerId);
    }
    passiveReconnectStateRef.current.delete(remoteId);
  }, []);

  const clearEstablishedPeerAutoRecoveryState = useCallback(
    (remoteId: string, reason: string) => {
      clearPeerWatchdogTimers(remoteId);
      clearReconnectTimer(remoteId);
      reconnectPendingRef.current.delete(remoteId);
      clearPassiveReconnectState(remoteId);
      cancelPassiveWaitOffer(remoteId, reason);
      clearNoStreamNoOfferTimer(remoteId);
      lastHealActionAtRef.current.delete(remoteId);
      peerHealActionRef.current.delete(remoteId);
      passiveJoinSettledRef.current.add(remoteId);
    },
    [
      cancelPassiveWaitOffer,
      clearNoStreamNoOfferTimer,
      clearPassiveReconnectState,
      clearPeerWatchdogTimers,
      clearReconnectTimer,
    ]
  );

  clearEstablishedPeerAutoRecoveryStateRef.current =
    clearEstablishedPeerAutoRecoveryState;

  const markPeerAutoRecoveryFrozen = useCallback(
    (
      remoteId: string,
      reason: "audio_confirmed_strict" | "playback_evidence"
    ) => {
      const prev = peerAutoRecoveryFrozenRef.current.get(remoteId);
      if (prev !== "audio_confirmed_strict") {
        peerAutoRecoveryFrozenRef.current.set(remoteId, reason);
      }
      bidirectionalEstablishedRef.current.add(remoteId);
      clearEstablishedPeerAutoRecoveryState(remoteId, reason);
    },
    [clearEstablishedPeerAutoRecoveryState]
  );

  markPeerAutoRecoveryFrozenRef.current = markPeerAutoRecoveryFrozen;

  const sendReconnectRequest = useCallback(
    async (
      remoteId: string,
      connectionId: string,
      reason: string,
      logKind: "sent" | "retry" = "sent"
    ): Promise<boolean> => {
      const compact = compactDeviceId(remoteId);
      const logReason =
        logKind === "retry" ? "no_offer_after_auto_hard_reset" : reason;

      const result = await sendSignal(remoteId, "reconnect-request", {
        connectionId,
        resetReason: reason,
      });

      if (!result.ok) {
        debugConsoleLog(
          `[voice-signal] reconnect-request-failed remote=${compact} ` +
            `name=${result.errorName ?? "unknown"} message=${result.errorMessage ?? "unknown"} ` +
            `reason=${logReason} connectionId=${compactConnectionId(connectionId)} ${formatVoiceModeSuffix()}`
        );
        return false;
      }

      const logTag =
        logKind === "retry"
          ? "reconnect-request-retry"
          : "reconnect-request-sent";
      debugConsoleLog(
        `[voice-signal] ${logTag} remote=${compact} reason=${logReason} ` +
          `connectionId=${compactConnectionId(connectionId)} ${formatVoiceModeSuffix()}`
      );

      const state = passiveReconnectStateRef.current.get(remoteId);
      if (state) {
        state.sentAt = Date.now();
      }

      return true;
    },
    [sendSignal]
  );

  const schedulePassiveReconnectRequestRetry = useCallback(
    (remoteId: string) => {
      const state = passiveReconnectStateRef.current.get(remoteId);
      if (!state) return;

      if (state.retryTimerId != null) {
        window.clearTimeout(state.retryTimerId);
      }

      state.retryTimerId = window.setTimeout(() => {
        state.retryTimerId = null;
        if (peerAutoRecoveryFrozenRef.current.has(remoteId)) {
          clearPassiveReconnectState(remoteId);
          return;
        }
        const pc = pcsRef.current.get(remoteId);
        if (
          pc?.signalingState === "have-remote-offer" ||
          offeredPeersRef.current.has(remoteId)
        ) {
          clearPassiveReconnectState(remoteId);
          return;
        }
        if (state.retryUsed) return;

        state.retryUsed = true;
        void sendReconnectRequest(
          remoteId,
          state.connectionId,
          state.reconnectReason,
          "retry"
        );
      }, RECONNECT_REQUEST_RETRY_MS);
    },
    [clearPassiveReconnectState, sendReconnectRequest]
  );

  const runPeerHardReset = useCallback(
    async (remoteId: string, reason: string, mode: PeerHardResetMode) => {
      if (!remoteId || remoteId === deviceId) return;

      const answerWait = getPeerAnswerWaitState(remoteId);
      if (answerWait.awaiting) {
        debugConsoleLog(
          `[voice-peer] hard-reset-blocked-awaiting-answer remote=${compactDeviceId(remoteId)} ` +
            `mode=${mode} trigger=${reason} ` +
            `connectionId=${compactConnectionId(answerWait.connectionId)} ` +
            `currentConnectionId=${compactConnectionId(answerWait.currentConnectionId)} ` +
            `elapsedMs=${answerWait.elapsedMs} remainingMs=${answerWait.remainingMs} ` +
            `sig=${answerWait.signalingState} caller=runPeerHardReset`
        );
        return;
      }

      if (
        peerAutoRecoveryFrozenRef.current.has(remoteId) &&
        mode !== "manual"
      ) {
        return;
      }

      if (mode === "manual") {
        peerAutoRecoveryFrozenRef.current.delete(remoteId);
      }

      if (mode === "auto") {
        const resetInput = buildReconnectDecisionInput(
          remoteId,
          reason,
          "auto_hard_reset"
        );
        const resetBlock = buildVoicePlaybackBlockReason(resetInput);
        if (resetBlock) {
          logVoiceReconnectDecision("voice-hard-reset-decision", {
            ...resetInput,
            allow: false,
            blockReason: resetBlock,
          });
          return;
        }
        logVoiceReconnectDecision("voice-hard-reset-decision", {
          ...resetInput,
          allow: true,
        });
      }

      const logPrefix = mode === "manual" ? "manual-hard-reset" : "auto-hard-reset";
      debugConsoleLog(
        `[voice-peer] ${logPrefix} remote=${compactDeviceId(remoteId)} reason=${reason} ${formatVoiceModeSuffix()}`
      );

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
      p2pDirectFailedSignalAtRef.current.delete(remoteId);
      clearPassiveReconnectState(remoteId);
      clearEndedRemoteAudio(remoteId);

      manualHardResetHealPassRef.current.add(remoteId);

      closePeer(remoteId, {
        clearConnectionId: true,
        preserveRemoteAudio: false,
        reason: `hard_reset_${reason}`,
        caller: "runPeerHardReset",
        force: mode === "manual",
      });

      const connectionIdReason =
        mode === "manual" ? "manual_hard_reset" : "auto_hard_reset";
      const newConnectionId = makeConnectionId(deviceId, remoteId);
      assignConnectionId(remoteId, newConnectionId, connectionIdReason);
      connectStartedAtRef.current.set(remoteId, Date.now());
      offeredPeersRef.current.delete(remoteId);
      startedPeersRef.current.delete(remoteId);
      setPeerState(remoteId, "connecting");

      if (deviceId > remoteId) {
        passiveReconnectStateRef.current.set(remoteId, {
          connectionId: newConnectionId,
          reconnectReason:
            mode === "auto" ? "auto_hard_reset" : "manual_reconnect",
          sentAt: null,
          retryUsed: false,
          retryTimerId: null,
          hardResetAt: Date.now(),
        });
      } else {
        clearPassiveReconnectState(remoteId);
      }

      emitPeerStates();

      debugConsoleLog(
        `[voice-peer] ${logPrefix}-done remote=${compactDeviceId(remoteId)} reason=${reason} ${formatVoiceModeSuffix()}`
      );
    },
    [
      assignConnectionId,
      buildReconnectDecisionInput,
      clearEndedRemoteAudio,
      clearPeerWatchdogTimers,
      clearPassiveReconnectState,
      clearReconnectTimer,
      closePeer,
      deviceId,
      emitPeerStates,
      getCurrentConnectionId,
      getPeerAnswerWaitState,
      setPeerState,
    ]
  );

  const logReconnectOfferDeferred = useCallback(
    (
      remoteId: string,
      reconnectReason: string,
      blockedReason: string,
      extra?: Record<string, string | number | boolean>
    ) => {
      const pc = pcsRef.current.get(remoteId) ?? null;
      const parts = [
        `[voice-peer] reconnect-offer-deferred remote=${compactDeviceId(remoteId)}`,
        `reconnectReason=${reconnectReason}`,
        `blockedReason=${blockedReason}`,
        `role=${deviceId < remoteId ? "active" : "passive"}`,
        `connectionId=${compactConnectionId(getCurrentConnectionId(remoteId))}`,
        `sig=${pc?.signalingState ?? "-"}`,
        `conn=${pc?.connectionState ?? "-"}`,
        `ice=${pc?.iceConnectionState ?? "-"}`,
        formatVoiceModeSuffix(),
      ];
      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          parts.push(`${key}=${value}`);
        }
      }
      debugConsoleLog(parts.join(" "));
    },
    [deviceId, getCurrentConnectionId]
  );

  const beginReconnectAfterHardReset = useCallback(
    async (
      remoteId: string,
      opts?: {
        skipReconnectRequest?: boolean;
        forceOffer?: boolean;
        reconnectReason?: "manual_reconnect" | "auto_hard_reset";
      }
    ) => {
      const isOfferOwner = deviceId < remoteId;
      const connectionId = getCurrentConnectionId(remoteId);
      const reconnectReason = opts?.reconnectReason ?? "manual_reconnect";

      if (
        shouldSuppressAutoVoiceRecoveryForPeer(remoteId) &&
        !manualHardResetHealPassRef.current.has(remoteId)
      ) {
        logReconnectOfferDeferred(
          remoteId,
          reconnectReason,
          "auto_recovery_frozen"
        );
        return;
      }

      if (!connectionId) {
        debugConsoleLog(
          `[voice-peer] reconnect-offer-deferred remote=${compactDeviceId(remoteId)} ` +
            `reconnectReason=${reconnectReason} blockedReason=missing_connection_id ${formatVoiceModeSuffix()}`
        );
        return;
      }

      if (isOfferOwner || opts?.forceOffer) {
        clearPassiveReconnectState(remoteId);
        if (!canSendVoiceOffer()) {
          logReconnectOfferDeferred(
            remoteId,
            reconnectReason,
            getMicOfferBlockReason()
          );
          createPeerConnection(remoteId, connectionId, {
            caller: "beginReconnectAfterHardReset",
            reason: reconnectReason,
            force: reconnectReason === "manual_reconnect",
          });
          setPeerState(remoteId, "connecting");
          return;
        }
        await startPeerOffer(remoteId, {
          force: true,
          reason: reconnectReason,
        });
        return;
      }

      clearPassiveReconnectState(remoteId);
      createPeerConnection(remoteId, connectionId, {
        caller: "beginReconnectAfterHardReset",
        reason: reconnectReason,
        force: reconnectReason === "manual_reconnect",
      });
      setPeerState(remoteId, "connecting");

      if (!canSendVoiceOffer()) {
        logReconnectOfferDeferred(
          remoteId,
          reconnectReason,
          getMicOfferBlockReason()
        );
        schedulePassiveWaitOfferTimeout(remoteId, reconnectReason, {
          forceReschedule: true,
        });
        return;
      }

      if (reconnectReason === "manual_reconnect") {
        void startPeerOffer(remoteId, {
          force: true,
          reason: reconnectReason,
        });
        return;
      }

      const scheduled = schedulePassiveWaitOfferTimeout(remoteId, reconnectReason, {
        forceReschedule: true,
      });
      if (!scheduled) {
        logReconnectOfferDeferred(remoteId, reconnectReason, "passive_wait_not_scheduled");
        void startPeerOffer(remoteId, {
          force: true,
          reason: `${reconnectReason}_passive_offer`,
        });
        return;
      }

      if (!opts?.skipReconnectRequest) {
        await sendReconnectRequest(
          remoteId,
          connectionId,
          reconnectReason
        );
      }
      schedulePassiveReconnectRequestRetry(remoteId);
      scheduleNoStreamNoOfferTimeout(remoteId, reconnectReason);
    },
    [
      canSendVoiceOffer,
      clearPassiveReconnectState,
      createPeerConnection,
      deviceId,
      getCurrentConnectionId,
      getMicOfferBlockReason,
      logReconnectOfferDeferred,
      scheduleNoStreamNoOfferTimeout,
      schedulePassiveReconnectRequestRetry,
      schedulePassiveWaitOfferTimeout,
      sendReconnectRequest,
      setPeerState,
      shouldSuppressAutoVoiceRecoveryForPeer,
      startPeerOffer,
    ]
  );

  const tryRunPeerAutoHardReset = useCallback(
    async (remoteId: string, triggerReason: string) => {
      if (!remoteId || remoteId === deviceId) return;
      if (!micReady || !signalReady) return;
      if (!isRemoteInCall(remoteId)) return;
      if (autoHardResetGiveUpRef.current.has(remoteId)) return;
      if (autoHardResetInProgressRef.current.has(remoteId)) return;

      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      if (isAutoHardResetConfirmedHold(timestamps)) {
        return;
      }

      const lastAt = autoHardResetLastAtRef.current.get(remoteId);
      if (
        lastAt != null &&
        Date.now() - lastAt < AUTO_HARD_RESET_MIN_INTERVAL_MS
      ) {
        debugConsoleLog(
          `[voice-peer] auto-hard-reset-skip remote=${compactDeviceId(remoteId)} reason=rate_limited ` +
            `trigger=${triggerReason} ${formatVoiceModeSuffix()}`
        );
        return;
      }

      const attempts = autoHardResetAttemptCountRef.current.get(remoteId) ?? 0;
      if (attempts >= AUTO_HARD_RESET_MAX_ATTEMPTS) {
        if (!autoHardResetGiveUpRef.current.has(remoteId)) {
          autoHardResetGiveUpRef.current.add(remoteId);
          debugConsoleLog(
            `[voice-peer] auto-hard-reset-give-up remote=${compactDeviceId(remoteId)} attempts=${AUTO_HARD_RESET_MAX_ATTEMPTS} ` +
              `${formatVoiceModeSuffix()}`
          );
          emitPeerStates();
        }
        return;
      }

      autoHardResetInProgressRef.current.add(remoteId);
      autoHardResetLastAtRef.current.set(remoteId, Date.now());
      autoHardResetAttemptCountRef.current.set(remoteId, attempts + 1);
      emitPeerStates();

      try {
        await runPeerHardReset(remoteId, triggerReason, "auto");
        await beginReconnectAfterHardReset(remoteId, {
          reconnectReason: "auto_hard_reset",
        });
      } finally {
        autoHardResetInProgressRef.current.delete(remoteId);
        emitPeerStates();
      }
    },
    [
      beginReconnectAfterHardReset,
      deviceId,
      emitPeerStates,
      isRemoteInCall,
      micReady,
      runPeerHardReset,
      signalReady,
    ]
  );

  const evaluateAndRunAutoHardResetForPeer = useCallback(
    (remoteId: string) => {
      if (autoHardResetGiveUpRef.current.has(remoteId)) return;
      if (autoHardResetInProgressRef.current.has(remoteId)) return;

      const preserveUntil =
        preserveRemoteAudioUntilRef.current.get(remoteId) ?? 0;
      if (preserveUntil > 0 && Date.now() < preserveUntil) {
        logVoiceReconnectDecision("voice-hard-reset-decision", {
          ...buildReconnectDecisionInput(
            remoteId,
            "orphan_remote_audio_provisional",
            "auto_hard_reset_eval"
          ),
          allow: false,
          blockReason: "preserve_remote_audio_window",
        });
        return;
      }

      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      if (isAutoHardResetConfirmedHold(timestamps)) {
        return;
      }

      const pc = pcsRef.current.get(remoteId) ?? null;
      const media = getPeerMedia(remoteId);

      if (isPeerAwaitingRemoteAnswer(remoteId)) {
        const answerWait = getPeerAnswerWaitState(remoteId);
        logVoiceReconnectDecision("voice-hard-reset-decision", {
          ...buildReconnectDecisionInput(
            remoteId,
            "awaiting_remote_answer",
            "auto_hard_reset_eval"
          ),
          allow: false,
          blockReason: "awaiting_remote_answer",
        });
        voiceProdLogUntilDeadline({
          key: `auto-hard-reset-blocked:${remoteId}`,
          deadlineAtMs: Date.now() + answerWait.remainingMs,
          nearDeadlineMs: 3000,
          minRepeatMs: 30_000,
          args: [
            `[voice-peer] auto-hard-reset-blocked remote=${compactDeviceId(remoteId)} ` +
              `reason=awaiting_remote_answer remainingMs=${answerWait.remainingMs} ` +
              `connectionId=${compactConnectionId(answerWait.connectionId)} ` +
              `currentConnectionId=${compactConnectionId(answerWait.currentConnectionId)} ` +
              `elapsedMs=${answerWait.elapsedMs} sig=${answerWait.signalingState}`,
          ],
        });
        return;
      }

      const trigger = evaluateAutoHardResetTrigger({
        pc,
        timestamps,
        hasRemoteStream: media.hasRemoteStream,
        hasPc: isUsablePeerConnection(pc),
        isOrphan: orphanRemoteAudioRef.current.has(remoteId),
        orphanSince: orphanRemoteAudioAtRef.current.get(remoteId) ?? null,
        connectStartedAt: connectStartedAtRef.current.get(remoteId) ?? null,
        p2pDirectFailedAt: p2pDirectFailedSignalAtRef.current.get(remoteId) ?? null,
        nowMs: Date.now(),
        awaitingRemoteAnswer: isPeerAwaitingRemoteAnswer(remoteId),
      });

      if (!trigger) return;

      logVoiceReconnectDecision("voice-hard-reset-decision", {
        ...buildReconnectDecisionInput(remoteId, trigger, "auto_hard_reset_eval"),
        allow: true,
        action: trigger,
      });

      void tryRunPeerAutoHardReset(remoteId, trigger);
    },
    [
      buildReconnectDecisionInput,
      getPeerAnswerWaitState,
      getPeerMedia,
      isPeerAwaitingRemoteAnswer,
      tryRunPeerAutoHardReset,
    ]
  );

  const flushPendingReconnectRequests = useCallback(() => {
    for (const [remoteId, state] of passiveReconnectStateRef.current.entries()) {
      if (state.sentAt != null) continue;
      void sendReconnectRequest(
        remoteId,
        state.connectionId,
        state.reconnectReason
      );
    }
  }, [sendReconnectRequest]);

  const manualPeerHardReset = useCallback(
    async (remoteId: string) => {
      const answerWait = getPeerAnswerWaitState(remoteId);
      if (answerWait.awaiting) {
        debugConsoleLog(
          `[voice-peer] manual-hard-reset-blocked remote=${compactDeviceId(remoteId)} ` +
            `reason=awaiting_remote_answer remainingMs=${answerWait.remainingMs} ` +
            `connectionId=${compactConnectionId(answerWait.connectionId)} ` +
            `currentConnectionId=${compactConnectionId(answerWait.currentConnectionId)} ` +
            `elapsedMs=${answerWait.elapsedMs} sig=${answerWait.signalingState} caller=manualPeerHardReset`
        );
        return;
      }

      autoHardResetAttemptCountRef.current.delete(remoteId);
      autoHardResetGiveUpRef.current.delete(remoteId);
      autoHardResetInProgressRef.current.delete(remoteId);
      await runPeerHardReset(remoteId, "user_requested_audio_reconnect", "manual");
      await beginReconnectAfterHardReset(remoteId, {
        reconnectReason: "manual_reconnect",
      });
      emitPeerStates();
    },
    [beginReconnectAfterHardReset, emitPeerStates, getPeerAnswerWaitState, runPeerHardReset]
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

      const establishedSkip = getEstablishedPeerSkipReasonForPeer(remoteId);
      if (
        establishedSkip &&
        !manualHardResetHealPassRef.current.has(remoteId)
      ) {
        clearEstablishedPeerAutoRecoveryState(remoteId, establishedSkip);
        return true;
      }

      const mode = isOfferOwner ? "offer" : "passive_wait_offer";
      const role: "active" | "passive" = isOfferOwner ? "active" : "passive";
      const existingForEnsure = pcsRef.current.get(remoteId) ?? null;
      const attempt = (ensurePeerAttemptRef.current.get(remoteId) ?? 0) + 1;
      ensurePeerAttemptRef.current.set(remoteId, attempt);

      logVoicePeerRole({
        localDeviceId: deviceId,
        remoteDeviceId: remoteId,
        role,
        reason: "device_id_order",
        localGreater: deviceId > remoteId,
      });

      logVoiceEnsureRepeat({
        remoteId,
        reason,
        role,
        attempt,
        force,
        hasPc: isUsablePeerConnection(existingForEnsure),
        sig: existingForEnsure?.signalingState,
      });

      if (voiceTransportDisabledRef.current) {
        console.warn("[voice-audio-disabled] reason=p2p_and_turn_disabled");
        logEnsureSkipped(remoteId, reason, "voice_transport_disabled");
        notifyStatus(
          "P2Pと自前TURNが両方OFFのため、音声通話は開始できません"
        );
        return false;
      }

      if (!voiceSettingsReadyRef.current) {
        logEnsureSkipped(remoteId, reason, "voice_settings_not_loaded");
        return false;
      }

      if (!p2pEnabledRef.current && turnFallbackEnabledRef.current) {
        if (
          iceServersRef.current.length === 0 ||
          !hasTurnIceServer(iceServersRef.current)
        ) {
          logEnsureSkipped(remoteId, reason, "relay_forced_without_turn_servers");
          void enableTurnFallback({ initial: true }).then((ok) => {
            if (ok) healPeerConnectionsRef.current();
          });
          return false;
        }
      }

      if (!isOfferOwner && !micReady) {
        // Passive peers can wait for remote offer without a live local mic track.
      } else if (!micReady) {
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
      if (
        !isLocalTrackLive(localAudioTrackRef, localStreamRef) &&
        !canEnsurePeerWithoutLocalTrack(
          isOfferOwner,
          voicePolicy.releaseMicOnMute,
          userMutedRef
        )
      ) {
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

      const passiveAwait = passiveReconnectStateRef.current.get(remoteId);
      if (!isOfferOwner && passiveAwait) {
        if (passiveAwait.sentAt == null) {
          void sendReconnectRequest(
            remoteId,
            passiveAwait.connectionId,
            passiveAwait.reconnectReason
          );
        }
        const awaitingPc = pcsRef.current.get(remoteId) ?? null;
        logEnsureSkipped(remoteId, reason, "passive_awaiting_reconnect_offer");
        return isUsablePeerConnection(awaitingPc);
      }

      const existing = pcsRef.current.get(remoteId) ?? null;
      const hasUsablePc = isUsablePeerConnection(existing);

      if (hasUsablePc && !force) {
        const phase = getPeerNegotiationPhase(remoteId, existing);
        if (shouldSuppressPassiveOfferReschedule(phase)) {
          passiveJoinSettledRef.current.add(remoteId);
          logEnsureSkipped(remoteId, reason, "already_has_pc");
          return true;
        }
        if (phase === "idle_unnegotiated") {
          if (isOfferOwner) {
            ensurePeerLocalAudioSender(remoteId, reason);
            if (canSendVoiceOffer()) {
              void maybeStartOffer(remoteId);
            } else {
              logMicOfferBlocked(remoteId);
            }
          } else if (canSendVoiceOffer()) {
            beginPassiveOfferWait(remoteId, reason, {
              forceReschedule: reason === "mic_ready",
              initialJoin: reason === "passive_on_join",
            });
          } else {
            logMicOfferBlocked(remoteId);
          }
          return true;
        }
      }

      emitVoiceStartCheck(remoteId);

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
        logVoicePeerCompetition({
          remoteId,
          action: "ensure_replace_pc",
          reason,
          role,
          connectionId: getCurrentConnectionId(remoteId),
          sig: existing?.signalingState,
          conn: existing?.connectionState,
        });
        const closed = closePeer(remoteId, {
          clearConnectionId: false,
          preserveRemoteAudio: hasLiveRemoteAudioStream(remoteId),
          reason: `ensure_replace_${reason}`,
          caller: "ensurePeerConnection",
        });
        if (!closed) {
          return isUsablePeerConnection(pcsRef.current.get(remoteId));
        }
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
        voiceProdLog(
          `[voice-peer] passive_wait_offer remote=${compactDeviceId(remoteId)} reason=${reason}`
        );
        createPeerConnection(remoteId, connectionId, {
          caller: "ensurePeerConnection",
          reason,
        });
        setPeerState(remoteId, "connecting");
        if (canSendVoiceOffer()) {
          schedulePassiveWaitOfferTimeout(remoteId, reason, {
            initialJoin: !isEndedStreamReconnectReason(reason),
          });
          scheduleNoStreamNoOfferTimeout(remoteId, reason);
        } else {
          logMicOfferBlocked(remoteId);
        }
      }

      const createdPc = pcsRef.current.get(remoteId) ?? null;
      const ok = isUsablePeerConnection(createdPc);
      debugConsoleLog(
        `[voice-peer] ensurePeerConnection reason=${reason} remote=${compact} ok=${ok} ` +
          `owner=${isOfferOwner} mode=${mode} pc=${ok}`
      );
      return ok;
    },
    [
      assignConnectionId,
      beginPassiveOfferWait,
      canSendVoiceOffer,
      clearReconnectTimer,
      closePeer,
      createPeerConnection,
      deviceId,
      enableTurnFallback,
      emitVoiceStartCheck,
      ensurePeerLocalAudioSender,
      getCurrentConnectionId,
      getEstablishedPeerSkipReasonForPeer,
      getP2pDirectFailedHoldRemainingMs,
      getPeerNegotiationPhase,
      getReconnectBlockReason,
      clearEstablishedPeerAutoRecoveryState,
      isRemoteInCall,
      localAudioTrackRef,
      localStreamRef,
      logEnsureSkipped,
      logMicOfferBlocked,
      markConnectStart,
      maybeStartOffer,
      micReady,
      notifyStatus,
      schedulePassiveWaitOfferTimeout,
      scheduleNoStreamNoOfferTimeout,
      sendReconnectRequest,
      setPeerState,
      signalReady,
    ]
  );

  ensurePeerConnectionRef.current = ensurePeerConnection;

  const runPeerSoftReset = useCallback(
    async (remoteId: string, triggerReason: VoiceSoftResetTriggerReason) => {
      if (!remoteId || remoteId === deviceId) return;
      if (triggerReason === "max_attempts") return;

      const answerWait = getPeerAnswerWaitState(remoteId);
      if (answerWait.awaiting) {
        debugConsoleLog(
          `[voice-soft-reset] blocked remote=${compactDeviceId(remoteId)} ` +
            `reason=awaiting_remote_answer remainingMs=${answerWait.remainingMs} ` +
            `connectionId=${compactConnectionId(answerWait.connectionId)} caller=runPeerSoftReset`
        );
        return;
      }

      const marks = getPeerPipelineMarks(remoteId);
      const hasPlaybackEvidence = hasRemotePlaybackEvidence(remoteId);
      const audioConfirmedStrict =
        marks.audio_confirmed_strict ||
        remotePlaybackHealthRef.current.get(remoteId)?.audioConfirmedStrict ===
          true;

      if (
        shouldBlockVoiceSoftReset({ audioConfirmedStrict, hasPlaybackEvidence })
      ) {
        bidirectionalEstablishedRef.current.add(remoteId);
        return;
      }

      const attempts = softResetAttemptCountRef.current.get(remoteId) ?? 0;
      if (attempts >= MAX_VOICE_SOFT_RESET_ATTEMPTS) return;

      softResetAttemptCountRef.current.set(remoteId, attempts + 1);
      softResetLastAtRef.current.set(remoteId, Date.now());

      debugConsoleLog(
        `[voice-soft-reset] start remote=${compactDeviceId(remoteId)} ` +
          `attempt=${attempts + 1}/${MAX_VOICE_SOFT_RESET_ATTEMPTS} ` +
          `reason=${triggerReason} ${formatVoiceModeSuffix()}`
      );

      setRemoteAudios((prev) => {
        if (!prev[remoteId]) return prev;
        const next = { ...prev };
        delete next[remoteId];
        return next;
      });
      delete remoteAudiosRef.current[remoteId];
      remoteStreamsRef.current.delete(remoteId);
      orphanRemoteAudioRef.current.delete(remoteId);
      orphanRemoteAudioAtRef.current.delete(remoteId);

      clearPeerWatchdogTimers(remoteId);
      clearReconnectTimer(remoteId);
      reconnectPendingRef.current.delete(remoteId);
      passiveFallbackOfferByConnRef.current.delete(remoteId);
      passiveWaitOfferMetaRef.current.delete(remoteId);
      peerSignalTimestampsRef.current.set(remoteId, emptyPeerSignalTimestamps());
      resetVoiceNegotiationSteps(remoteId);
      resetVoicePeerMarks(remoteId);
      resetPeerAudioDiagnostics(remoteId);
      remotePlaybackHealthRef.current.delete(remoteId);
      offeredPeersRef.current.delete(remoteId);
      pendingIceRef.current.delete(remoteId);
      startedPeersRef.current.delete(remoteId);
      audioStrictRecoveryAttemptedRef.current.delete(remoteId);
      oneWayAudioLoggedRef.current.forEach((key) => {
        if (key === remoteId || key.startsWith(`${remoteId}:`)) {
          oneWayAudioLoggedRef.current.delete(key);
        }
      });

      closePeer(remoteId, {
        clearConnectionId: true,
        preserveRemoteAudio: false,
        reason: `soft_reset_${triggerReason}`,
      });

      const newConnectionId = makeConnectionId(deviceId, remoteId);
      assignConnectionId(remoteId, newConnectionId, "soft_reset");
      connectStartedAtRef.current.set(remoteId, Date.now());
      setPeerState(remoteId, "connecting");

      ensurePeerConnection(remoteId, "soft_reset_rejoin", { force: true });
      emitPeerStates();

      debugConsoleLog(
        `[voice-soft-reset] done remote=${compactDeviceId(remoteId)} ` +
          `reason=${triggerReason} connectionId=${compactConnectionId(newConnectionId)} ` +
          `${formatVoiceModeSuffix()}`
      );
    },
    [
      assignConnectionId,
      clearPeerWatchdogTimers,
      clearReconnectTimer,
      closePeer,
      deviceId,
      emitPeerStates,
      ensurePeerConnection,
      getPeerAnswerWaitState,
      hasRemotePlaybackEvidence,
      setPeerState,
    ]
  );

  const evaluateAndRunVoiceSoftResetForPeer = useCallback(
    async (remoteId: string) => {
      if (!remoteId || remoteId === deviceId) return;
      if (!micReady || !signalReady) return;
      if (!isRemoteInCall(remoteId)) return;
      if (bidirectionalEstablishedRef.current.has(remoteId)) return;
      if (isPeerAwaitingRemoteAnswer(remoteId)) return;

      const joinEpoch = voiceJoinEpochRef.current;
      if (joinEpoch.sessionId !== sessionId || joinEpoch.startedAt <= 0) return;
      const joinAgeMs = Date.now() - joinEpoch.startedAt;

      const marks = getPeerPipelineMarks(remoteId);
      const health = remotePlaybackHealthRef.current.get(remoteId) ?? null;
      const hasPlaybackEvidence = hasRemotePlaybackEvidence(remoteId);
      const audioConfirmedStrict =
        marks.audio_confirmed_strict || health?.audioConfirmedStrict === true;

      if (
        shouldBlockVoiceSoftReset({ audioConfirmedStrict, hasPlaybackEvidence })
      ) {
        bidirectionalEstablishedRef.current.add(remoteId);
        return;
      }

      const attempts = softResetAttemptCountRef.current.get(remoteId) ?? 0;
      const pc = pcsRef.current.get(remoteId) ?? null;
      if (!pc || !isUsablePeerConnection(pc)) return;

      const stats = await collectPeerRtpStats(pc, remoteId);
      const media = getPeerMedia(remoteId);
      const subClass = audioConfirmedStrict
        ? ("OK" as OneWayAudioSubClass)
        : classifyPeerAudioSubClass(remoteId, { stats, health });
      const iceConnected = isTransportMediaConnected(
        pc.connectionState,
        pc.iceConnectionState
      );
      const remoteTrackReceived =
        marks.remote_track_received || media.remoteTracksCount > 0;

      if (
        isBidirectionalAudioEstablished({
          remoteTrackReceived,
          inboundDeltaBytes: stats.deltaInboundBytes,
          outboundDeltaBytes: stats.deltaOutboundBytes,
          subClass,
          audioConfirmedStrict,
          hasPlaybackEvidence,
        })
      ) {
        bidirectionalEstablishedRef.current.add(remoteId);
        return;
      }

      const trigger = evaluateVoiceSoftResetTrigger({
        joinAgeMs,
        iceConnected,
        remoteTrackReceived,
        audioConfirmedStrict,
        hasPlaybackEvidence,
        inboundDeltaBytes: stats.deltaInboundBytes,
        outboundDeltaBytes: stats.deltaOutboundBytes,
        subClass,
        softResetAttempts: attempts,
        lastSoftResetAt: softResetLastAtRef.current.get(remoteId) ?? null,
      });

      if (!trigger) return;

      if (trigger === "max_attempts") {
        if (!softResetExhaustedNotifiedRef.current.has(remoteId)) {
          softResetExhaustedNotifiedRef.current.add(remoteId);
          debugConsoleLog(
            `[voice-soft-reset] exhausted remote=${compactDeviceId(remoteId)} ` +
              `attempts=${MAX_VOICE_SOFT_RESET_ATTEMPTS} joinAgeMs=${joinAgeMs}`
          );
          onSoftResetExhaustedRef.current?.(remoteId, trigger);
        }
        return;
      }

      await runPeerSoftReset(remoteId, trigger);
    },
    [
      classifyPeerAudioSubClass,
      deviceId,
      getPeerMedia,
      hasRemotePlaybackEvidence,
      isPeerAwaitingRemoteAnswer,
      isRemoteInCall,
      micReady,
      runPeerSoftReset,
      sessionId,
      signalReady,
    ]
  );

  const recoverMissingPc = useCallback(
    (remoteId: string, reason: string) => {
      const establishedSkip = getEstablishedPeerSkipReasonForPeer(remoteId);
      if (establishedSkip) {
        debugConsoleLog(
          `[voice-peer] recover-missing-pc-skip remote=${compactDeviceId(remoteId)} ` +
            `reason=${reason} skip=${establishedSkip} ${formatVoiceModeSuffix()}`
        );
        return true;
      }

      const holdRemainingMs = getP2pDirectFailedHoldRemainingMs(remoteId);
      if (holdRemainingMs != null) {
        debugConsoleLog(
          `[voice-peer] p2p-retry-allowed-during-turn-hold remote=${compactDeviceId(remoteId)} ` +
            `reason=${reason} holdRemainingMs=${holdRemainingMs} ${formatVoiceModeSuffix()}`
        );
      }

      debugConsoleLog(
        `[voice-peer] recover-missing-pc remote=${compactDeviceId(remoteId)} reason=${reason} ` +
          `inCall=${isRemoteInCall(remoteId)} hasPc=${isUsablePeerConnection(pcsRef.current.get(remoteId))} ` +
          `${formatVoiceModeSuffix()}`
      );

      return ensurePeerConnection(remoteId, reason, { force: true });
    },
    [
      ensurePeerConnection,
      getEstablishedPeerSkipReasonForPeer,
      getP2pDirectFailedHoldRemainingMs,
      isRemoteInCall,
    ]
  );

  const attemptSoftIceRestart = useCallback(
    async (remoteId: string) => {
      if (deviceId >= remoteId) return false;

      const attempts = softIceRestartAttemptsRef.current.get(remoteId) ?? 0;
      if (attempts >= MAX_SOFT_ICE_RESTART_ATTEMPTS) {
        return false;
      }

      const pc = pcsRef.current.get(remoteId);
      if (!pc || !isUsablePeerConnection(pc)) return false;

      const connectionId = getCurrentConnectionId(remoteId);
      if (!connectionId) return false;
      if (pc.signalingState !== "stable") return false;

      softIceRestartAttemptsRef.current.set(remoteId, attempts + 1);

      const stats = getOrCreatePeerIceStats(remoteId);
      stats.localTypes.clear();
      stats.localCount = 0;
      stats.gatheringState = "new";

      debugConsoleLog(
        `[voice-peer] soft-ice-restart remote=${compactDeviceId(remoteId)} ` +
          `attempt=${attempts + 1}/${MAX_SOFT_ICE_RESTART_ATTEMPTS} ` +
          `conn=${pc.connectionState} ice=${pc.iceConnectionState} ${formatVoiceModeSuffix()}`
      );

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
        scheduleIceCheckingTimeout(remoteId, connectionId, pc);
        return true;
      } catch (e) {
        console.warn("[call] soft-ice-restart failed", remoteId, e);
        return false;
      }
    },
    [
      deviceId,
      getCurrentConnectionId,
      getOrCreatePeerIceStats,
      scheduleIceCheckingTimeout,
      sendSignal,
      touchPeerSignal,
    ]
  );

  const maybeSoftRenegotiatePeer = useCallback(
    async (remoteId: string) => {
      const pc = pcsRef.current.get(remoteId);
      if (!pc || !isUsablePeerConnection(pc)) return false;
      if (isPeerEstablishedForRecovery(remoteId, pc)) return false;
      if (!isPcConnectingOrIceChecking(pc)) return false;

      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();
      if (!hasActivePlaybackWithoutConfirmation(timestamps)) return false;

      const now = Date.now();
      const stuckSince = getSoftRebuildStuckSinceMs({
        timestamps,
        connectStartedAt: connectStartedAtRef.current.get(remoteId),
        checkingStuckSince: checkingPlaybackStuckAtRef.current.get(remoteId),
      });
      if (stuckSince == null) return false;

      const stuckAgeMs = now - stuckSince;
      if (stuckAgeMs < SOFT_REBUILD_ICE_UNCONFIRMED_MS) return false;

      const playbackAgeMs =
        signalAgeMs(timestamps.lastPlaybackActiveAt) ??
        signalAgeMs(timestamps.lastPlaySuccessAt);

      if (!softRebuildCandidateLoggedRef.current.has(remoteId)) {
        softRebuildCandidateLoggedRef.current.add(remoteId);
        debugConsoleLog(
          `[voice-peer] soft-rebuild-candidate remote=${compactDeviceId(remoteId)} ` +
            `reason=playback_active_but_ice_unconfirmed conn=${pc.connectionState} ` +
            `ice=${pc.iceConnectionState} playbackAgeMs=${playbackAgeMs ?? "-"} ` +
            `confirmedAt=- stuckAgeMs=${stuckAgeMs} ${formatVoiceModeSuffix()}`
        );
      }

      const lastSoftAt = softRenegotiateLastAtRef.current.get(remoteId) ?? 0;
      if (now - lastSoftAt < SOFT_REBUILD_MIN_INTERVAL_MS) {
        return false;
      }
      softRenegotiateLastAtRef.current.set(remoteId, now);

      debugConsoleLog(
        `[voice-peer] soft-renegotiate remote=${compactDeviceId(remoteId)} ` +
          `reason=ice_unconfirmed_with_playback conn=${pc.connectionState} ` +
          `ice=${pc.iceConnectionState} playbackAgeMs=${playbackAgeMs ?? "-"} ${formatVoiceModeSuffix()}`
      );
      logVoicePeerAutoRecover({
        remoteId,
        action: "reconnect",
        reason: "ice_unconfirmed_with_playback",
      });

      await attemptSignalingRecoverRef.current(
        remoteId,
        "ice_unconfirmed_with_playback"
      );

      if (deviceId < remoteId) {
        await attemptSoftIceRestart(remoteId);
      } else {
        const connectionId = getCurrentConnectionId(remoteId);
        if (connectionId && !reconnectPendingRef.current.has(remoteId)) {
          const passiveState = passiveReconnectStateRef.current.get(remoteId);
          if (!passiveState || passiveState.sentAt == null) {
            void sendReconnectRequest(
              remoteId,
              connectionId,
              "soft_renegotiate_passive"
            );
          }
        }
      }

      if (isPeerEligibleForP2pIceRetry(remoteId, pc)) {
        void runP2pNoRelayRetryPhaseRef.current(
          remoteId,
          pc,
          "soft_rebuild_ice_unconfirmed"
        );
      }

      return true;
    },
    [
      attemptSoftIceRestart,
      deviceId,
      getCurrentConnectionId,
      isPeerEligibleForP2pIceRetry,
      isPeerEstablishedForRecovery,
      sendReconnectRequest,
    ]
  );

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

      debugConsoleLog(
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

      debugConsoleLog(
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
    maybeSoftRenegotiatePeerRef.current = maybeSoftRenegotiatePeer;
  }, [maybeSoftRenegotiatePeer]);

  useEffect(() => {
    attemptIceRestartRef.current = attemptIceRestart;
  }, [attemptIceRestart]);

  useEffect(() => {
    attemptTurnFallbackForPeerRef.current = attemptTurnFallbackForPeer;
  }, [attemptTurnFallbackForPeer]);

  const clearP2pNoRelayRetryFollowup = useCallback((remoteId: string) => {
    const timer = p2pNoRelayRetryFollowupTimersRef.current.get(remoteId);
    if (timer) {
      window.clearTimeout(timer);
      p2pNoRelayRetryFollowupTimersRef.current.delete(remoteId);
    }
  }, []);

  const resolveP2pRetryStartReason = useCallback((_context: string) => {
    return "ice_unconfirmed";
  }, []);

  const scheduleP2pBackgroundRetry = useCallback(
    (remoteId: string) => {
      const existing = p2pRetryBackgroundTimersRef.current.get(remoteId);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        p2pRetryBackgroundTimersRef.current.delete(remoteId);

        const pc = pcsRef.current.get(remoteId);
        if (!pc || !isUsablePeerConnection(pc)) return;
        if (!isPeerEligibleForP2pIceRetry(remoteId, pc)) {
          p2pRetryExhaustedRef.current.delete(remoteId);
          return;
        }

        const cycle = (p2pBackgroundRetryCycleRef.current.get(remoteId) ?? 0) + 1;
        p2pBackgroundRetryCycleRef.current.set(remoteId, cycle);
        p2pNoRelayRetryAttemptsRef.current.delete(remoteId);

        if (
          cycle % P2P_BACKGROUND_RECONNECT_EVERY_N_CYCLES === 0 &&
          deviceId < remoteId &&
          !reconnectPendingRef.current.has(remoteId)
        ) {
          debugConsoleLog(
            `[voice-peer] p2p-background-reconnect remote=${compactDeviceId(remoteId)} ` +
              `cycle=${cycle} ${formatVoiceModeSuffix()}`
          );
          scheduleReconnectRef.current?.(remoteId, 1500, {
            reason: "p2p_background_retry_reconnect",
            source: "p2p_background_retry",
            force: true,
          });
          scheduleP2pBackgroundRetry(remoteId);
          return;
        }

        void runP2pNoRelayRetryPhaseRef.current(
          remoteId,
          pc,
          "p2p_background_retry"
        );
        scheduleP2pBackgroundRetry(remoteId);
      }, P2P_BACKGROUND_RETRY_INTERVAL_MS);

      p2pRetryBackgroundTimersRef.current.set(remoteId, timer);
    },
    [deviceId, isPeerEligibleForP2pIceRetry]
  );

  const checkP2pNoRelayRetrySuccess = useCallback(
    async (remoteId: string, pc: RTCPeerConnection): Promise<boolean> => {
      const iceStats = getOrCreatePeerIceStats(remoteId);
      const pair = await logVoiceIceCandidatePairFromPc(
        remoteId,
        pc,
        iceStats
      );
      if (!isTransportMediaConnected(pc.connectionState, pc.iceConnectionState)) {
        return false;
      }
      if (
        pair.route === "turn" &&
        !turnFallbackEnabledRef.current &&
        !relayForcedRef.current
      ) {
        return false;
      }

      p2pNoRelaySelectedPairRef.current.set(remoteId, pair);
      p2pNoRelayRetryAttemptsRef.current.delete(remoteId);
      p2pRetryExhaustedRef.current.delete(remoteId);
      p2pBackgroundRetryCycleRef.current.delete(remoteId);
      clearP2pNoRelayRetryFollowup(remoteId);

      debugConsoleLog(
        `[voice-peer] p2p-retry-success remote=${compactDeviceId(remoteId)} ` +
          `route=p2p localType=${pair.localType} remoteType=${pair.remoteType} ` +
          `networkType=${pair.networkType} ${formatVoiceModeSuffix()}`
      );
      return true;
    },
    [clearP2pNoRelayRetryFollowup, getOrCreatePeerIceStats]
  );

  const runP2pNoRelayRetryPhase = useCallback(
    async (
      remoteId: string,
      pc: RTCPeerConnection,
      context: string
    ): Promise<boolean> => {
      if (!isPeerEligibleForP2pIceRetry(remoteId, pc)) {
        return false;
      }

      const stats = getOrCreatePeerIceStats(remoteId);
      if (hasNoRelayCandidates(stats) && !turnFallbackEnabledRef.current) {
        logP2pRetryOnly(remoteId, context);
      }

      if (await checkP2pNoRelayRetrySuccess(remoteId, pc)) {
        return false;
      }

      if (p2pNoRelayRetryInFlightRef.current.has(remoteId)) {
        return true;
      }

      const attempts = p2pNoRelayRetryAttemptsRef.current.get(remoteId) ?? 0;
      if (attempts >= MAX_P2P_NO_RELAY_RETRY_ATTEMPTS) {
        const turnEnabled = turnFallbackEnabledRef.current;
        debugConsoleLog(
          `[voice-peer] p2p-retry-exhausted remote=${compactDeviceId(remoteId)} ` +
            `attempts=${attempts} context=${context} turnFallback=${turnEnabled} ` +
            `${formatVoiceModeSuffix()}`
        );
        p2pNoRelayRetryAttemptsRef.current.delete(remoteId);
        clearP2pNoRelayRetryFollowup(remoteId);
        p2pRetryExhaustedRef.current.add(remoteId);

        if (turnEnabled) {
          return attemptTurnFallbackForPeer(remoteId, "p2p_retry_exhausted");
        }

        scheduleP2pBackgroundRetry(remoteId);
        return false;
      }

      p2pNoRelayRetryInFlightRef.current.add(remoteId);
      try {
        if (attempts === 0) {
          debugConsoleLog(
            `[voice-peer] p2p-retry-start remote=${compactDeviceId(remoteId)} ` +
              `reason=${resolveP2pRetryStartReason(context)} context=${context} ` +
              `${formatVoiceModeSuffix()}`
          );
        }

        const step = attempts;
        p2pNoRelayRetryAttemptsRef.current.set(remoteId, attempts + 1);

        await logVoiceIceCandidatePairFromPc(
          remoteId,
          pcsRef.current.get(remoteId) ?? pc,
          stats
        );

        if (step === 0) {
          await flushPendingIce(remoteId);
          await attemptSignalingRecoverRef.current?.(
            remoteId,
            "p2p_retry_flush"
          );
        } else if (step === 1) {
          if (deviceId < remoteId) {
            debugConsoleLog(
              `[voice-peer] p2p-retry-ice-restart remote=${compactDeviceId(remoteId)} ` +
                `attempt=${step + 1} kind=soft ${formatVoiceModeSuffix()}`
            );
            await attemptSoftIceRestart(remoteId);
          } else {
            await attemptSignalingRecoverRef.current?.(
              remoteId,
              "p2p_retry_passive_signaling"
            );
            const connectionId = getCurrentConnectionId(remoteId);
            if (connectionId) {
              const passiveState = passiveReconnectStateRef.current.get(remoteId);
              if (!passiveState || passiveState.sentAt == null) {
                void sendReconnectRequest(
                  remoteId,
                  connectionId,
                  "p2p_retry_passive"
                );
              }
            }
          }
        } else {
          if (deviceId < remoteId) {
            debugConsoleLog(
              `[voice-peer] p2p-retry-ice-restart remote=${compactDeviceId(remoteId)} ` +
                `attempt=${step + 1} kind=full ${formatVoiceModeSuffix()}`
            );
            await attemptIceRestartRef.current?.(remoteId);
          } else {
            await flushPendingIce(remoteId);
            await attemptSignalingRecoverRef.current?.(
              remoteId,
              "p2p_retry_passive_ice"
            );
          }
        }

        const currentPc = pcsRef.current.get(remoteId) ?? pc;
        if (await checkP2pNoRelayRetrySuccess(remoteId, currentPc)) {
          return false;
        }

        clearP2pNoRelayRetryFollowup(remoteId);
        const followupTimer = window.setTimeout(() => {
          p2pNoRelayRetryFollowupTimersRef.current.delete(remoteId);
          const nextPc = pcsRef.current.get(remoteId);
          if (!nextPc || !isUsablePeerConnection(nextPc)) return;

          if (!isPcConnectingOrIceChecking(nextPc)) {
            void checkP2pNoRelayRetrySuccess(remoteId, nextPc);
            return;
          }

          void runP2pNoRelayRetryPhaseRef.current(
            remoteId,
            nextPc,
            "p2p_retry_followup"
          );
        }, P2P_NO_RELAY_RETRY_FOLLOWUP_MS);
        p2pNoRelayRetryFollowupTimersRef.current.set(remoteId, followupTimer);

        return true;
      } finally {
        p2pNoRelayRetryInFlightRef.current.delete(remoteId);
      }
    },
    [
      attemptTurnFallbackForPeer,
      attemptSoftIceRestart,
      checkP2pNoRelayRetrySuccess,
      clearP2pNoRelayRetryFollowup,
      deviceId,
      flushPendingIce,
      getCurrentConnectionId,
      getOrCreatePeerIceStats,
      isPeerEligibleForP2pIceRetry,
      logP2pRetryOnly,
      resolveP2pRetryStartReason,
      scheduleP2pBackgroundRetry,
      sendReconnectRequest,
    ]
  );

  useEffect(() => {
    runP2pNoRelayRetryPhaseRef.current = runP2pNoRelayRetryPhase;
  }, [runP2pNoRelayRetryPhase]);

  const scanAndEnsureMissingPcs = useCallback(
    (trigger: string, peers: VoiceMeshPeerSummaryEntry[]) => {
      const missing = peers.filter(
        (peer) => !peer.pcExists && peer.isInCall === true
      );
      const localTrackState = getLocalTrackReadyState(
        localAudioTrackRef,
        localStreamRef
      );

      const receiveOnly = isReceiveOnlyMutedSession(
        voicePolicy.releaseMicOnMute,
        userMutedRef
      );
      const passiveNeedsPc = hasPassiveRemoteNeedingPc(
        deviceId,
        missing.map((peer) => peer.remoteDeviceId),
        peerNeedsPc
      );
      const localTrackLive = isLocalTrackLive(
        localAudioTrackRef,
        localStreamRef
      );
      if (!signalReady) {
        debugConsoleLog(
          `[voice-peer] recoverMissingPcsFromMesh skipped trigger=${trigger} peers=${peers.length} missing=${missing.length} ` +
            `signalReady=${signalReady} ${formatVoiceModeSuffix()}`
        );
        return;
      }
      if (
        !micReady &&
        !passiveNeedsPc
      ) {
        debugConsoleLog(
          `[voice-peer] recoverMissingPcsFromMesh skipped trigger=${trigger} peers=${peers.length} missing=${missing.length} ` +
            `micReady=${micReady} passiveNeedsPc=${passiveNeedsPc} ${formatVoiceModeSuffix()}`
        );
        return;
      }
      if (!localTrackLive && !receiveOnly && !passiveNeedsPc) {
        debugConsoleLog(
          `[voice-peer] recoverMissingPcsFromMesh skipped trigger=${trigger} peers=${peers.length} missing=${missing.length} ` +
            `micReady=${micReady} signalReady=${signalReady} localTrack=${localTrackState} receiveOnly=${receiveOnly} passiveNeedsPc=${passiveNeedsPc} ${formatVoiceModeSuffix()}`
        );
        return;
      }

      debugConsoleLog(
        `[voice-peer] recoverMissingPcsFromMesh start trigger=${trigger} peers=${peers.length} missing=${missing.length} ` +
          `micReady=${micReady} signalReady=${signalReady} localTrack=${localTrackState} ` +
          `missingRemotes=${missing.map((peer) => compactDeviceId(peer.remoteDeviceId)).join(",") || "-"} ` +
          `${formatVoiceModeSuffix()}`
      );

      if (missing.length === 0) {
        debugConsoleLog(
          `[voice-peer] recoverMissingPcsFromMesh done trigger=${trigger} missing=0`
        );
        return;
      }

      for (const peer of missing) {
        const establishedSkip = getEstablishedPeerSkipReasonForPeer(
          peer.remoteDeviceId
        );
        if (establishedSkip) {
          debugConsoleLog(
            `[voice-peer] heal-skip-healthy target=${compactDeviceId(peer.remoteDeviceId)} ` +
              `reason=${establishedSkip} trigger=${trigger} ${formatVoiceModeSuffix()}`
          );
          continue;
        }
        recoverMissingPc(
          peer.remoteDeviceId,
          "mesh_missing_pc_after_transport_failed"
        );
      }
    },
    [
      deviceId,
      getEstablishedPeerSkipReasonForPeer,
      localAudioTrackRef,
      localStreamRef,
      micReady,
      peerNeedsPc,
      recoverMissingPc,
      signalReady,
      userMutedRef,
      voicePolicy.releaseMicOnMute,
    ]
  );

  scanAndEnsureMissingPcsRef.current = scanAndEnsureMissingPcs;

  const HEAL_SKIP_HEALTHY_LOG_DEDUPE_MS = 5000;

  const logHealSkipHealthy = useCallback(
    (
      remoteId: string,
      reason: string,
      pc: RTCPeerConnection | null | undefined
    ) => {
      const nowMs = Date.now();
      const last = healSkipHealthyLastLogRef.current.get(remoteId);
      if (
        last &&
        last.reason === reason &&
        nowMs - last.atMs < HEAL_SKIP_HEALTHY_LOG_DEDUPE_MS
      ) {
        return;
      }
      healSkipHealthyLastLogRef.current.set(remoteId, { reason, atMs: nowMs });
      debugConsoleLog(
        `[voice-peer] heal-skip-healthy target=${compactDeviceId(remoteId)} reason=${reason} ` +
          `conn=${pc?.connectionState ?? "-"} ice=${pc?.iceConnectionState ?? "-"} ` +
          `sig=${pc?.signalingState ?? "-"} ${formatVoiceModeSuffix()}`
      );
    },
    []
  );

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

    const remoteIdsForHeal = getRemoteIds();
    const passiveNeedsPc = hasPassiveRemoteNeedingPc(
      deviceId,
      remoteIdsForHeal,
      peerNeedsPc
    );

    if (!signalReady) {
      runHealScan("healRun_signal_not_ready");
      return;
    }

    if (!micReady && !passiveNeedsPc) {
      runHealScan("healRun_mic_not_ready");
      return;
    }

    const receiveOnly = isReceiveOnlyMutedSession(
      voicePolicy.releaseMicOnMute,
      userMutedRef
    );
    const localTrackLive = isLocalTrackLive(
      localAudioTrackRef,
      localStreamRef
    );
    if (!localTrackLive && !receiveOnly && !passiveNeedsPc) {
      debugConsoleLog(
        `[voice-peer] healPeerConnections skipped micReady=${micReady} localTrack=${getLocalTrackReadyState(localAudioTrackRef, localStreamRef)} receiveOnly=${receiveOnly} passiveNeedsPc=${passiveNeedsPc} ${formatVoiceModeSuffix()}`
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
          run: () =>
            maybeClosePeerForMemberRemoval(existingId, "heal_member_left"),
        });
      }
    }

    for (const remoteId of remoteIds) {
      if (!isRemoteInCall(remoteId)) {
        continue;
      }

      const pc = pcsRef.current.get(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();

      const establishedSkip = getEstablishedPeerSkipReasonForPeer(remoteId);
      if (establishedSkip) {
        if (pc) {
          setPeerState(remoteId, "connected");
        }
        logHealSkipHealthy(remoteId, establishedSkip, pc);
        continue;
      }

      if (hasStaleEndedRemoteAudio(remoteId)) {
        clearEndedRemoteAudio(remoteId);
        debugConsoleLog(
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
        debugConsoleLog(
          `[voice-peer] heal-cooldown-bypass remote=${compactDeviceId(remoteId)} reason=no_stream_no_offer_deadlock ${formatVoiceModeSuffix()}`
        );
        blockReason = null;
      }

      const needsPc = peerNeedsPc(remoteId);
      const transportHealthy = isPeerTransportHealthy(pc);
      const holdCheck = getTrackEndedHoldCheck(remoteId, pc);

      if (hasStream && connected) {
        setPeerState(remoteId, "connected");
        continue;
      }

      if (pc && isPeerPcDisconnectedOnly({ conn: pc.connectionState })) {
        const pcDisconnectedSuppress =
          evaluateIceDisconnectedReconnectSuppressReason(
            buildIceDisconnectedGuardInput(remoteId, pc)
          );
        if (pcDisconnectedSuppress) {
          logHealSkipHealthy(
            remoteId,
            `pc_disconnected_${pcDisconnectedSuppress}`,
            pc
          );
          continue;
        }
        logHealSkipHealthy(remoteId, "pc_disconnected_awaiting_grace", pc);
        continue;
      }

      if (
        pc &&
        isPeerIceDisconnectedOnly({
          conn: pc.connectionState,
          ice: pc.iceConnectionState,
        })
      ) {
        const disconnectedSuppress = evaluateIceDisconnectedReconnectSuppressReason(
          buildIceDisconnectedGuardInput(remoteId, pc)
        );
        if (disconnectedSuppress) {
          if (pc.connectionState === "connected") {
            setPeerState(remoteId, "connected");
          }
          logHealSkipHealthy(
            remoteId,
            `ice_disconnected_${disconnectedSuppress}`,
            pc
          );
          continue;
        }
        logHealSkipHealthy(remoteId, "ice_disconnected_awaiting_grace", pc);
        continue;
      }

      if (
        hasStream &&
        pc &&
        isPcConnectingOrIceChecking(pc) &&
        timestamps.lastPlaybackConfirmedAt == null &&
        isPeerEligibleForP2pIceRetry(remoteId, pc)
      ) {
        logHealSkipHealthy(remoteId, "p2p_ice_retry_active", pc);
        void runP2pNoRelayRetryPhaseRef.current(
          remoteId,
          pc,
          "heal_ice_unconfirmed"
        );
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
          reason: "missing_pc",
          run: () => {
            recoverMissingPc(remoteId, "heal_missing_pc_after_transport_failed");
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
        (pc.connectionState === "failed" ||
          pc.iceConnectionState === "failed" ||
          pc.connectionState === "connecting")
      ) {
        if (transportHealthy) {
          logHealSkipHealthy(remoteId, "stream_without_connected_pc_but_healthy", pc);
          continue;
        }

        if (
          isPeerIceDisconnectedOnly({
            conn: pc.connectionState,
            ice: pc.iceConnectionState,
          })
        ) {
          const disconnectedSuppress = evaluateIceDisconnectedReconnectSuppressReason(
            buildIceDisconnectedGuardInput(remoteId, pc)
          );
          if (disconnectedSuppress) {
            if (pc.connectionState === "connected") {
              setPeerState(remoteId, "connected");
            }
            logHealSkipHealthy(
              remoteId,
              `ice_disconnected_${disconnectedSuppress}`,
              pc
            );
            continue;
          }
          logHealSkipHealthy(remoteId, "ice_disconnected_awaiting_grace", pc);
          continue;
        }

        const waitCheck = getLiveStreamWaitConnectedCheckForPeer({
          pc,
          hasLiveRemoteStream: hasStream,
          remoteTracksCount: media.remoteTracksCount,
          hasRemoteStream: media.hasRemoteStream,
          timestamps,
          connectStartedAt: connectStartedAtRef.current.get(remoteId),
        });

        if (waitCheck?.shouldHold) {
          debugConsoleLog(
            `[voice-peer] heal-hold remote=${compactDeviceId(remoteId)} reason=${waitCheck.holdReason ?? "recent_live_stream_wait_connected"} ` +
              `conn=${pc.connectionState} ice=${pc.iceConnectionState} ` +
              `playbackActiveAgeMs=${waitCheck.playbackActiveAgeMs ?? "-"} playAgeMs=${waitCheck.playAgeMs ?? "-"} ` +
              `ontrackAgeMs=${waitCheck.ontrackAgeMs ?? "-"} activityAgeMs=${waitCheck.activityAgeMs ?? "-"} ${formatVoiceModeSuffix()}`
          );
          if (!isPeerEligibleForP2pIceRetry(remoteId, pc)) {
            void maybeSoftRenegotiatePeerRef.current(remoteId);
          }
          continue;
        }

        if (waitCheck?.graceExpired) {
          debugConsoleLog(
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
        pc.connectionState === "closed";

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

      if (
        pc &&
        isPeerIceDisconnectedOnly({
          conn: pc.connectionState,
          ice: pc.iceConnectionState,
        })
      ) {
        const disconnectedSuppress = evaluateIceDisconnectedReconnectSuppressReason(
          buildIceDisconnectedGuardInput(remoteId, pc)
        );
        if (disconnectedSuppress) {
          if (pc.connectionState === "connected") {
            setPeerState(remoteId, "connected");
          }
          logHealSkipHealthy(
            remoteId,
            `ice_disconnected_${disconnectedSuppress}`,
            pc
          );
          continue;
        }
        logHealSkipHealthy(remoteId, "ice_disconnected_awaiting_grace", pc);
        continue;
      }

      const stuckOffer =
        offeredPeersRef.current.has(remoteId) &&
        !hasStream &&
        pc.signalingState === "have-local-offer";

      if (stuckOffer) {
        if (isVoiceJoinStabilizing()) {
          logHealSkipHealthy(remoteId, "stuck_offer_join_stabilization", pc);
          continue;
        }

        const offerAt =
          timestamps.lastOfferAt ??
          connectStartedAtRef.current.get(remoteId) ??
          Date.now();
        const offerMarks = getPeerPipelineMarks(remoteId);
        const offerAgeMs = Date.now() - offerAt;
        const waitingForAnswer =
          pc.signalingState === "have-local-offer" && !offerMarks.answer_received;

        if (waitingForAnswer && offerAgeMs < HAVE_LOCAL_OFFER_STUCK_MS) {
          logHealSkipHealthy(remoteId, "stuck_offer_awaiting_answer", pc);
          continue;
        }

        if (offerAgeMs > HAVE_LOCAL_OFFER_STUCK_MS) {
          planned.push({
            remoteId,
            action: "retry-offer",
            reason: "stuck_have_local_offer",
            scheduledInMs: HEAL_STUCK_OFFER_RECONNECT_MS,
            run: () => {
              offeredPeersRef.current.delete(remoteId);
              scheduleReconnect(remoteId, HEAL_STUCK_OFFER_RECONNECT_MS, {
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

        if (isVoiceJoinStabilizing()) {
          logHealSkipHealthy(remoteId, "no_stream_no_offer_join_stabilization", pc);
          continue;
        }

        debugConsoleLog(
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

            const isOfferOwner = deviceId < remoteId;
            if (isOfferOwner) {
              void startPeerOffer(remoteId, { reason: "no_stream_no_offer" });
            } else if (!isUsablePeerConnection(pcsRef.current.get(remoteId))) {
              ensurePeerConnection(remoteId, "no_stream_no_offer_passive", {
                force: true,
              });
            } else {
              schedulePassiveWaitOfferTimeout(
                remoteId,
                "no_stream_no_offer_passive_wait",
                { initialJoin: true }
              );
            }
          },
        });
      }
    }

    const actionable = planned.filter((item) => item.action !== "deduped");

    debugConsoleLog(
      `[voice-peer] heal-plan ${formatVoiceModeSuffix()} ` +
        `actionable=${actionable.map((item) => `${compactDeviceId(item.remoteId)}:${item.action}:${item.reason}`).join("|") || "none"} ` +
        `deduped=${planned.filter((item) => item.action === "deduped").map((item) => `${compactDeviceId(item.remoteId)}:${item.reason}`).join("|") || "none"} ` +
        `scope=${buildPeerScopeSnapshot(pcsRef.current, getPeerMedia)}`
    );

    const runMissingPcSafetyNet = () => {
      for (const remoteId of remoteIds) {
        if (!isRemoteInCall(remoteId)) continue;
        if (getEstablishedPeerSkipReasonForPeer(remoteId)) continue;
        if (!peerNeedsPc(remoteId)) continue;
        recoverMissingPc(remoteId, "heal_safety_net_missing_pc");
      }
    };

    if (actionable.length === 0) {
      if (planned.length > 0) {
        debugConsoleLog(
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

      if (item.action === "reconnect" || item.action === "retry-offer") {
        logVoiceReconnectDecision("voice-heal-decision", {
          ...buildReconnectDecisionInput(
            item.remoteId,
            item.reason,
            "heal_peer_connections"
          ),
          allow: true,
          action: item.action,
        });
      }

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
    buildIceDisconnectedGuardInput,
    buildMeshPeerSummary,
    closePeer,
    deviceId,
    emitMeshSummary,
    emitPeerStates,
    ensurePeerConnection,
    getCurrentConnectionId,
    getEstablishedPeerSkipReasonForPeer,
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
    logHealSkipHealthy,
    recoverMissingPc,
    markConnectStart,
    maybeStartOffer,
    micReady,
    peerNeedsPc,
    isVoiceJoinStabilizing,
    scheduleNoStreamNoOfferTimeout,
    schedulePassiveWaitOfferTimeout,
    scheduleReconnect,
    sessionId,
    assignConnectionId,
    setPeerState,
    signalReady,
    startPeerOffer,
    buildReconnectDecisionInput,
    userMutedRef,
    voicePolicy.releaseMicOnMute,
  ]);

  healPeerConnectionsRef.current = healPeerConnections;

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
            incomingConnectionId: row.payload?.connectionId ?? null,
            currentConnectionId: getCurrentConnectionId(remoteId),
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
          incomingConnectionId: row.payload?.connectionId ?? null,
          currentConnectionId: getCurrentConnectionId(remoteId),
        });
        return;
      }
      if (row.to_device_id && row.to_device_id !== deviceId) {
        logVoiceSignalIgnored({
          reason: "wrong_target",
          type: signalType,
          remote: remoteId,
          expectedTarget: deviceId,
          gotTarget: row.to_device_id,
          incomingConnectionId: row.payload?.connectionId ?? null,
          currentConnectionId: getCurrentConnectionId(remoteId),
        });
        return;
      }
      if (row.signal_type === "offer" || row.signal_type === "answer") {
        voiceProdLog(
          `[voice-signal] inbound type=${row.signal_type} from=${compactDeviceId(remoteId)} ` +
            `connectionId=${compactConnectionId(row.payload?.connectionId)} ` +
            `target=${compactDeviceId(row.to_device_id ?? deviceId)}`
        );
      } else if (row.signal_type === "ice") {
        debugConsoleLog(
          `[voice-signal] inbound type=${row.signal_type} from=${compactDeviceId(remoteId)} ` +
            `connectionId=${compactConnectionId(row.payload?.connectionId)} ` +
            `target=${compactDeviceId(row.to_device_id ?? deviceId)}`
        );
      }

      if (row.session_id !== sessionId) {
        logVoiceSignalIgnored({
          reason: "wrong_session",
          type: signalType,
          remote: remoteId,
          expectedSessionId: sessionId,
          gotSessionId: row.session_id,
          incomingConnectionId: row.payload?.connectionId ?? null,
          currentConnectionId: getCurrentConnectionId(remoteId),
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
            incomingConnectionId: null,
            currentConnectionId: getCurrentConnectionId(remoteId),
          });
          return;
        }

        const requestReason =
          String(payload.resetReason ?? "").trim() || "reconnect_request_received";
        const offerReason =
          requestReason === "auto_hard_reset" ||
          requestReason === "no_offer_after_auto_hard_reset"
            ? "auto_hard_reset"
            : "manual_reconnect";

        debugConsoleLog(
          `[voice-signal] reconnect-request-received remote=${compactDeviceId(remoteId)} ` +
            `reason=${offerReason} connectionId=${compactConnectionId(incomingConnectionId)} ${formatVoiceModeSuffix()}`
        );

        await runPeerHardReset(remoteId, requestReason, "auto");
        assignConnectionId(
          remoteId,
          incomingConnectionId,
          "reconnect_request_received"
        );
        clearPassiveReconnectState(remoteId);
        await startPeerOffer(remoteId, {
          force: true,
          reason: offerReason,
        });
        return;
      }

      const incomingConnectionId = payload.connectionId;

      if (row.signal_type === "leave") {
        markRemotePeerExplicitRemoved(remotePeerGraceRefsRef.current, remoteId);
        voiceSessionMemberIdsRef.current.delete(remoteId);
        closePeer(remoteId, { clearConnectionId: true, reason: "leave_signal" });
        return;
      }

      if (!incomingConnectionId) {
        logVoiceSignalIgnored({
          reason: "missing_connection_id",
          type: signalType,
          remote: remoteId,
          incomingConnectionId: null,
          currentConnectionId: getCurrentConnectionId(remoteId),
        });
        return;
      }

      let currentConnectionId = getCurrentConnectionId(remoteId);

      const existingPc = pcsRef.current.get(remoteId) ?? null;
      const media = getPeerMedia(remoteId);
      const timestamps =
        peerSignalTimestampsRef.current.get(remoteId) ??
        emptyPeerSignalTimestamps();

      let offerAnswerReason: string | undefined;

      if (row.signal_type === "offer") {
        if (
          currentConnectionId !== incomingConnectionId &&
          shouldRejectIncomingStaleOffer(
            remoteId,
            incomingConnectionId,
            existingPc
          )
        ) {
          logVoiceSignalIgnored({
            reason: "stale_offer_established_peer",
            type: "offer",
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

        const offerMarks = getPeerPipelineMarks(remoteId);
        const localOfferInFlight =
          existingPc?.signalingState === "have-local-offer" ||
          offerMarks.offer_sent ||
          offeredPeersRef.current.has(remoteId);
        const glareDecision = resolveOfferConnectionConflict({
          localDeviceId: deviceId,
          remoteDeviceId: remoteId,
          localConnectionId: currentConnectionId,
          incomingConnectionId,
          sig: existingPc?.signalingState ?? "-",
          localOfferInFlight,
          localAnswerReceived: offerMarks.answer_received,
        });

        if (glareDecision?.action === "ignore_remote_offer") {
          logVoiceGlare({
            remoteId,
            localConnectionId: currentConnectionId,
            inboundConnectionId: incomingConnectionId,
            action: glareDecision.action,
            reason: glareDecision.reason,
            sig: existingPc?.signalingState ?? "-",
          });
          logVoiceSignalIgnored({
            reason: glareDecision.reason,
            type: "offer",
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

        if (glareDecision?.action === "rollback_accept_remote_offer") {
          logVoiceGlare({
            remoteId,
            localConnectionId: currentConnectionId,
            inboundConnectionId: incomingConnectionId,
            action: glareDecision.action,
            sig: existingPc?.signalingState ?? "-",
          });
          logVoiceGlareRollbackStart({
            remoteId,
            connectionId: incomingConnectionId,
            sig: existingPc?.signalingState ?? "-",
          });

          cancelPassiveWaitOffer(remoteId, "glare_accept_remote_offer");
          passiveFallbackOfferByConnRef.current.delete(remoteId);
          offeredPeersRef.current.delete(remoteId);
          clearAnswerWaitTimer(remoteId, "glare_rollback_accept", "handleSignal");

          const sameConnectionId = currentConnectionId === incomingConnectionId;
          let rollbackSig = existingPc?.signalingState ?? "-";

          if (existingPc?.signalingState === "have-local-offer") {
            try {
              await existingPc.setLocalDescription({ type: "rollback" });
              rollbackSig = existingPc.signalingState;
            } catch (rollbackErr) {
              voiceProdLog(
                `[voice-glare] rollback-failed remote=${compactDeviceId(remoteId)} ` +
                  `connectionId=${compactConnectionId(incomingConnectionId)} ` +
                  `message=${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`
              );
            }
          }

          logVoiceGlareRollbackDone({
            remoteId,
            connectionId: incomingConnectionId,
            sig: rollbackSig,
          });

          if (
            !sameConnectionId ||
            (existingPc && existingPc.signalingState !== "stable")
          ) {
            if (existingPc) {
              closePeer(remoteId, {
                clearConnectionId: false,
                preserveRemoteAudio: false,
                reason: "glare_abandon_local_offer",
                caller: "handleSignal",
              });
            }
            assignConnectionId(
              remoteId,
              incomingConnectionId,
              "glare_accept_remote_offer"
            );
            currentConnectionId = incomingConnectionId;
          }

          logVoiceGlareAcceptRemoteOffer({
            remoteId,
            connectionId: incomingConnectionId,
          });
          connectStartedAtRef.current.set(remoteId, Date.now());
          startedPeersRef.current.add(remoteId);
          offerAnswerReason = "glare_rollback_accept";
        } else if (
          glareDecision?.action === "accept_incoming_connection_id" &&
          currentConnectionId !== incomingConnectionId
        ) {
          assignConnectionId(
            remoteId,
            incomingConnectionId,
            "glare_accept_remote_offer"
          );
          currentConnectionId = incomingConnectionId;
        }
      } else if (
        !currentConnectionId ||
        currentConnectionId !== incomingConnectionId
      ) {
        if (row.signal_type === "answer") {
          logVoiceSignalIgnored({
            reason: "stale_answer_connection_id",
            type: "answer",
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
          if (signalType === "ice") {
            logVoiceIceCandidateIgnored({
              remoteId,
              connectionId: incomingConnectionId,
              reason: "connection_id_mismatch",
            });
          }
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

      if (!voiceSettingsReadyRef.current) {
        debugConsoleLog(
          `[voice-signal] inbound-blocked remote=${compactDeviceId(remoteId)} type=${signalType} ` +
            `reason=voice_settings_not_loaded connectionId=${compactConnectionId(incomingConnectionId)}`
        );
        logVoiceSignalIgnored({
          reason: "voice_settings_not_loaded",
          type: signalType,
          remote: remoteId,
          incomingConnectionId,
          currentConnectionId,
        });
        return;
      }

      const pc = createPeerConnection(remoteId, incomingConnectionId, {
        caller: "handleIncomingSignal",
        reason: `${signalType}_received`,
      });
      if (!pc) return;

      try {
        if (row.signal_type === "offer") {
          const sdp = payload.sdp;
          if (!sdp) {
            logVoiceSignalIgnored({
              reason: "missing_sdp",
              type: "offer",
              remote: remoteId,
              incomingConnectionId,
              currentConnectionId,
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
            logVoiceSignalIgnored({
              reason: "invalid_signaling_state",
              type: "offer",
              remote: remoteId,
              incomingConnectionId,
              currentConnectionId,
              pcExists: true,
              sig: pc.signalingState,
              conn: pc.connectionState,
              ice: pc.iceConnectionState,
            });
            return;
          }

          voiceProdLog(
            `[voice-signal] set-remote-offer-start remote=${compactDeviceId(remoteId)} sig=${pc.signalingState}`
          );
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          logVoiceSignalSetRemoteOfferDone(remoteId, pc.signalingState);
          await flushPendingIce(remoteId, incomingConnectionId);
          touchPeerSignal(remoteId, "offer_received");
          cancelPassiveWaitOffer(remoteId, "inbound_offer_accepted");
          passiveFallbackOfferByConnRef.current.delete(remoteId);

          const offerMarks = getPeerPipelineMarks(remoteId);
          const establishedRenegotiation =
            pc.connectionState === "connected" &&
            (offerMarks.answer_received || offerMarks.remote_track_received);
          if (!establishedRenegotiation) {
            setPeerState(remoteId, "connecting");
          }

          voiceProdLog(
            `[voice-signal] answer-create-start remote=${compactDeviceId(remoteId)}` +
              (offerAnswerReason ? ` reason=${offerAnswerReason}` : "")
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const answerSendResult = await sendSignal(remoteId, "answer", {
            connectionId: incomingConnectionId,
            sdp: pc.localDescription,
          });
          if (!answerSendResult.ok) {
            voiceProdLog(
              `[voice-signal] answer-send-failed remote=${compactDeviceId(remoteId)} ` +
                `connectionId=${compactConnectionId(incomingConnectionId)} ` +
                `currentConnectionId=${compactConnectionId(getCurrentConnectionId(remoteId))} ` +
                `sig=${pc.signalingState} name=${answerSendResult.errorName ?? "unknown"} ` +
                `message=${answerSendResult.errorMessage ?? "unknown"}`
            );
            return;
          }
          logVoiceSignalAnswerSent(remoteId, incomingConnectionId, {
            reason: offerAnswerReason,
          });
          touchPeerSignal(remoteId, "answer_sent");
          markVoicePerf("answer_sent", { remoteId });
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
              incomingConnectionId,
              currentConnectionId,
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
              incomingConnectionId,
              currentConnectionId,
              pcExists: true,
              sig: pc.signalingState,
              conn: pc.connectionState,
              ice: pc.iceConnectionState,
            });
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(remoteId, incomingConnectionId);
          touchPeerSignal(remoteId, "answer_received");
          clearAnswerWaitTimer(remoteId, "answer_received", "handleSignal");
          answerWaitRetriedByConnRef.current.delete(remoteId);
          cancelPassiveWaitOffer(remoteId, "answer_received");
          passiveFallbackOfferByConnRef.current.delete(remoteId);
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
      cancelPassiveWaitOffer,
      clearAnswerWaitTimer,
      clearPassiveReconnectState,
      closePeer,
      createPeerConnection,
      deviceId,
      emitMeshSummary,
      flushPendingIce,
      getCurrentConnectionId,
      getOrCreatePeerIceStats,
      getPeerMedia,
      runPeerHardReset,
      scheduleReconnect,
      shouldRejectIncomingStaleOffer,
      startPeerOffer,
      sendSignal,
      sessionId,
      setPeerState,
      touchPeerSignal,
    ]
  );

  const voiceSettingsLoadedOnceRef = useRef(false);

  useEffect(() => {
    const scope = `${sessionId}|${deviceId}`;
    if (voiceSettingsScopeRef.current !== scope) {
      voiceSettingsScopeRef.current = scope;
      voiceSettingsLoadedOnceRef.current = false;
      applyVoiceSettingsReady(false, "scope_changed");
    }

    let alive = true;

    async function loadVoiceSettings() {
      let settingsVoiceEnabled = true;
      let emergencyMessage: string | null = null;
      let settingsSource = "api";

      const cachedTransport = getCachedVoiceTransport(sessionId);
      if (cachedTransport?.transport.relayForced) {
        void enableTurnFallback({ initial: true }).then((turnOk) => {
          if (turnOk && alive) {
            emitReadinessSnapshot("turn_prefetch");
            scheduleDeferredHealPeerConnections("turn_prefetch");
          }
        });
      }

      try {
        let transport = normalizeVoiceTransportSettings({});

        try {
          const res = await fetchWithRetry(
            "/api/voice-settings",
            { cache: "no-store" },
            { kind: "generic", maxAttempts: 2 }
          );

          const data = await res.json();

          if (!alive) return;

          const settings = data?.settings;
          transport = normalizeVoiceTransportSettings({
            p2p_enabled: data?.p2p_enabled ?? settings?.p2p_enabled,
            static_turn_enabled: data?.static_turn_enabled,
            turn_fallback_enabled:
              data?.turn_fallback_enabled ?? settings?.turn_fallback_enabled,
          });
          settingsVoiceEnabled = settings?.voice_enabled !== false;
          emergencyMessage =
            typeof settings?.emergency_message === "string"
              ? settings.emergency_message
              : null;
          setCachedVoiceTransport(sessionId, {
            p2p_enabled: transport.p2pEnabled,
            static_turn_enabled: transport.staticTurnEnabled,
            turn_fallback_enabled: transport.staticTurnEnabled,
            voice_enabled: settingsVoiceEnabled,
            emergency_message: emergencyMessage,
          });
          markVoicePerf("voice_settings_loaded", { extra: "cached=false" });
        } catch (fetchErr) {
          const cached = getCachedVoiceTransport(sessionId);
          if (!cached?.transport) {
            throw fetchErr;
          }
          transport = cached.transport;
          settingsVoiceEnabled = cached.voiceEnabled;
          emergencyMessage = cached.emergencyMessage;
          settingsSource = "cache";
          markVoicePerf("voice_settings_loaded", { extra: "cached=true" });
        }

        p2pEnabledRef.current = transport.p2pEnabled;
        relayForcedRef.current = transport.relayForced;
        voiceTransportDisabledRef.current = transport.voiceTransportDisabled;
        setTurnFallbackEnabled(transport.staticTurnEnabled);
        turnFallbackEnabledRef.current = transport.staticTurnEnabled;
        voiceSettingsLoadedOnceRef.current = true;

        const icePolicy = resolvePeerIceTransportPolicy({
          p2pEnabled: transport.p2pEnabled,
          staticTurnEnabled: transport.staticTurnEnabled,
          voiceRouteTurn: voiceRouteRef.current === "turn",
        });
        debugConsoleLog(
          `[voice-settings] client-loaded p2p_enabled=${transport.p2pEnabled} turn_provider=static icePolicy=${icePolicy} source=${settingsSource}`
        );
        debugConsoleLog(`[p2p] enabled value=${transport.p2pEnabled}`);
        debugConsoleLog(
          `[turn] static-enabled value=${transport.staticTurnEnabled}`
        );

        if (transport.voiceTransportDisabled) {
          console.warn("[voice-audio-disabled] reason=p2p_and_turn_disabled");
          notifyStatus(
            "P2Pと自前TURNが両方OFFのため、音声通話は開始できません"
          );
        } else if (settingsVoiceEnabled === false) {
          notifyStatus(emergencyMessage || "通話機能は停止中です");
        }

        if (transport.relayForced) {
          const turnOk = await enableTurnFallback({ initial: true });
          if (!alive) return;

          if (turnOk) {
            const stalePeerIds = Array.from(pcsRef.current.keys()).filter(
              (remoteId) => peerIcePolicyRef.current.get(remoteId) !== "relay"
            );
            for (const remoteId of stalePeerIds) {
              debugConsoleLog(
                `[voice-peer] relay-policy-migrate remote=${compactDeviceId(remoteId)} ` +
                  `from=${peerIcePolicyRef.current.get(remoteId) ?? "-"} to=relay`
              );
              closePeer(remoteId, CLOSE_FOR_RECONNECT);
            }
            if (stalePeerIds.length > 0) {
              healPeerConnectionsRef.current();
            }
          } else {
            console.warn(
              "[voice-settings] relay-forced but turn ice servers unavailable"
            );
          }
        }
      } catch (err) {
        const cached = getCachedVoiceTransport(sessionId);
        if (cached && voiceSettingsLoadedOnceRef.current) {
          p2pEnabledRef.current = cached.transport.p2pEnabled;
          relayForcedRef.current = cached.transport.relayForced;
          voiceTransportDisabledRef.current = cached.transport.voiceTransportDisabled;
          setTurnFallbackEnabled(cached.transport.staticTurnEnabled);
          turnFallbackEnabledRef.current = cached.transport.staticTurnEnabled;
        } else if (!voiceSettingsLoadedOnceRef.current) {
          console.warn(
            "[voice-settings] load failed before first load — peer creation blocked until retry",
            err
          );
        } else {
          console.warn("[voice-settings] load failed — keeping prior transport", err);
        }
      } finally {
        if (alive) {
          applyVoiceSettingsReady(true, "load_complete");
          scheduleDeferredHealPeerConnections("settings_load_complete");
        }
      }
    }

    void loadVoiceSettings();

    return () => {
      alive = false;
    };
  }, [
    applyVoiceSettingsReady,
    closePeer,
    deviceId,
    emitReadinessSnapshot,
    enableTurnFallback,
    notifyStatus,
    scheduleDeferredHealPeerConnections,
    sessionId,
  ]);

  useEffect(() => {
    resetVoicePeerPairRegistry(sessionId, deviceId);
    registerVoicePeerPairBuilder(() => {
      const remoteIds = getRemoteIds();
      const peerIds = Array.from(
        new Set([...remoteIds, ...Array.from(pcsRef.current.keys())])
      );
      return peerIds.map((remoteId) => buildPeerPairSnapshot(remoteId));
    });
    return () => {
      registerVoicePeerPairBuilder(null);
    };
  }, [buildPeerPairSnapshot, deviceId, getRemoteIds, sessionId]);

  const applyLocalAudioTrack = useCallback(
    (track: MediaStreamTrack | null, reason: string) => {
      const sendTrack =
        track && track.readyState === "live" && !userMutedRef.current
          ? track
          : null;

      for (const [remoteId, pc] of pcsRef.current) {
        const sender = pc
          .getSenders()
          .find((s) => s.track?.kind === "audio" || s.track === null);

        if (!sender) continue;
        void sender.replaceTrack(sendTrack);
        logVoicePeerReplaceTrack(remoteId, sendTrack, reason);
      }

      if (sendTrack && micReady && signalReady) {
        healPeerConnections();
      }
    },
    [
      healPeerConnections,
      micReady,
      signalReady,
      userMutedRef,
    ]
  );

  useEffect(() => {
    const track = localAudioTrackRef.current;
    const muted = userMutedRef.current;

    if (voicePolicy.releaseMicOnMute) {
      for (const [remoteId, pc] of pcsRef.current) {
        const sender = pc
          .getSenders()
          .find((s) => s.track?.kind === "audio" || s.track === null);

        if (!sender) continue;
        const next = muted ? null : track;
        void sender.replaceTrack(next);
        logVoicePeerReplaceTrack(
          remoteId,
          next,
          muted ? "muted_release_mic" : "unmuted_acquire_mic"
        );
      }
      return;
    }

    if (!track) return;

    applyUserMutedToTrack(track, muted, "userMuted_changed", "usePeerConnections");

    for (const [remoteId, pc] of pcsRef.current) {
      const sender = pc
        .getSenders()
        .find((s) => s.track?.kind === "audio" || s.track === null);

      if (sender) {
        const next = muted ? null : track;
        void sender.replaceTrack(next);
        logVoicePeerReplaceTrack(
          remoteId,
          next,
          muted ? "user_muted" : "user_unmuted"
        );
      }
    }
  }, [userMuted, userMutedRef, localAudioTrackRef, micReady, voicePolicy.releaseMicOnMute]);

  const voiceMembersFingerprint = useMemo(
    () => buildVoiceConnectionMembersFingerprint(members, deviceId),
    [members, deviceId]
  );

  useEffect(() => {
    const remoteIds = getRemoteIds();
    const membersFingerprint = voiceMembersFingerprint;
    const membersChanged =
      offerEffectMembersFingerprintRef.current !== membersFingerprint;
    offerEffectMembersFingerprintRef.current = membersFingerprint;

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

    if (!signalReady) {
      for (const remoteId of remoteIds) {
        emitVoiceStartCheck(remoteId);
        logVoiceStartBlocked(remoteId, "signal_not_ready");
      }
      voiceDebugLog("[voice-peer] offer effect stop", {
        reason: "signalReady_false",
      });
      return;
    }

    if (remoteIds.length < 1) {
      const strict = getStrictRemoteIds();
      debugConsoleLog(
        `[voice-peer] offer-effect-stop class=A reason=no_remoteIds strictCount=${strict.length} ` +
          `members=${members
            .map(
              (m) =>
                `${String(m.device_id ?? "").slice(-4)}:inCall=${m.is_in_call === true ? 1 : 0}:screen=${String(m.screen ?? "-")}`
            )
            .join("|")}`
      );
      logVoicePipelineClassification(undefined, "offer-effect-no_remoteIds");
      logVoiceStartBlocked("-", "no_remote_ids");
      voiceDebugLog("[voice-peer] offer effect stop", {
        reason: "no_remoteIds",
        strictRemoteIds: strict,
        members: members.map((m) => ({
          device_id: m.device_id,
          is_in_call: m.is_in_call,
          screen: m.screen,
        })),
      });
      return;
    }

    const receiveOnly = isReceiveOnlyMutedSession(
      voicePolicy.releaseMicOnMute,
      userMutedRef
    );
    const localTrackLive = isLocalTrackLive(
      localAudioTrackRef,
      localStreamRef
    );
    const settingsTurnSignalReady = isVoiceJoinTransportReady({
      signalReady,
      settingsReady: voiceSettingsReadyRef.current,
      voiceTransportDisabled: voiceTransportDisabledRef.current,
      relayForced: relayForcedRef.current,
      iceServers: iceServersRef.current,
    });
    const activeCanOffer =
      settingsTurnSignalReady &&
      micReady &&
      (localTrackLive || receiveOnly);
    const passiveCanWait = settingsTurnSignalReady;

    for (const existingId of Array.from(pcsRef.current.keys())) {
      if (!remoteIds.includes(existingId)) {
        startedPeersRef.current.delete(existingId);
        peerStatesRef.current.delete(existingId);
        passiveJoinSettledRef.current.delete(existingId);
        emitPeerStates();
        maybeClosePeerForMemberRemoval(existingId, "offer_effect_member_removed");
      }
    }

    if (remoteIds.length > 0) {
      markVoiceJoinEpochIfNeeded();
    }

    for (const remoteId of remoteIds) {
      const phase = getPeerNegotiationPhase(remoteId);
      const hasUsablePc = isUsablePeerConnection(pcsRef.current.get(remoteId));
      if (
        shouldSuppressPassiveOfferReschedule(phase) &&
        !membersChanged
      ) {
        passiveJoinSettledRef.current.add(remoteId);
        continue;
      }

      if (!hasUsablePc || membersChanged) {
        emitVoiceStartCheck(remoteId);
      }

      if (!getCurrentConnectionId(remoteId)) {
        assignConnectionId(
          remoteId,
          makeStableConnectionId(deviceId, remoteId),
          "member_join"
        );
      }

      const isOfferOwner = deviceId < remoteId;
      if (isOfferOwner) {
        if (!activeCanOffer) {
          if (!voiceSettingsReadyRef.current) {
            logVoiceStartBlocked(remoteId, "settings_not_ready");
          } else if (!signalReady) {
            logVoiceStartBlocked(remoteId, "signal_not_ready");
          } else if (
            relayForcedRef.current &&
            !hasTurnIceServer(iceServersRef.current)
          ) {
            logVoiceStartBlocked(remoteId, "turn_not_loaded");
          } else if (!micReady) {
            logVoiceStartBlocked(remoteId, "mic_not_ready");
          } else if (!localTrackLive && !receiveOnly) {
            logVoiceStartBlocked(remoteId, "local_track_not_live");
          }
          continue;
        }
        if (!activeOfferJoinLoggedRef.current.has(remoteId)) {
          activeOfferJoinLoggedRef.current.add(remoteId);
          voiceProdLog(
            `[voice-peer] active-offer-join remote=${compactDeviceId(remoteId)} ` +
              `settingsReady=${voiceSettingsReadyRef.current ? 1 : 0} ` +
              `turnReady=${hasTurnIceServer(iceServersRef.current) ? 1 : 0} ` +
              `signalReady=${signalReady ? 1 : 0} micReady=${micReady ? 1 : 0}`
          );
        }
        void maybeStartOffer(remoteId);
      } else {
        if (shouldSuppressPassiveOfferReschedule(phase)) {
          passiveJoinSettledRef.current.add(remoteId);
          continue;
        }
        if (phase === "idle_unnegotiated") {
          if (passiveCanWait) {
            beginPassiveOfferWait(remoteId, "passive_on_join", {
              initialJoin: true,
            });
          } else if (!voiceSettingsReadyRef.current) {
            logVoiceStartBlocked(remoteId, "settings_not_ready");
          } else if (!signalReady) {
            logVoiceStartBlocked(remoteId, "signal_not_ready");
          } else if (
            relayForcedRef.current &&
            !hasTurnIceServer(iceServersRef.current)
          ) {
            logVoiceStartBlocked(remoteId, "turn_not_loaded");
          }
          continue;
        }
        const ok = ensurePeerConnection(remoteId, "passive_on_join");
        if (
          ok &&
          shouldSuppressPassiveOfferReschedule(getPeerNegotiationPhase(remoteId))
        ) {
          passiveJoinSettledRef.current.add(remoteId);
        }
      }
    }

    scheduleDeferredHealPeerConnections("offer_effect");
    emitMeshSummary("after_join", { immediate: true });
    emitReadinessSnapshot("offer_effect");
  }, [
    voiceMembersFingerprint,
    micReady,
    signalReady,
    settingsReadyTick,
    turnReadyTick,
    deviceId,
    assignConnectionId,
    beginPassiveOfferWait,
    closePeer,
    emitMeshSummary,
    emitPeerStates,
    emitReadinessSnapshot,
    emitVoiceStartCheck,
    ensurePeerConnection,
    getPeerNegotiationPhase,
    getCurrentConnectionId,
    getRemoteIds,
    getStrictRemoteIds,
    localAudioTrackRef,
    localStreamRef,
    markVoiceJoinEpochIfNeeded,
    maybeClosePeerForMemberRemoval,
    maybeStartOffer,
    scheduleDeferredHealPeerConnections,
    userMutedRef,
    voicePolicy.releaseMicOnMute,
  ]);

  useEffect(() => {
    if (isStableVoiceJoinMode()) return;
    const selfId = String(deviceId ?? "").trim();
    for (const member of members) {
      const remoteId = String(member.device_id ?? "").trim();
      if (!remoteId || remoteId === selfId) continue;
      if (!isPresenceConfirmedRemoteLeave(member)) continue;
      if (!pcsRef.current.has(remoteId)) continue;
      maybeClosePeerForMemberRemoval(remoteId, "presence_confirmed_leave");
    }
  }, [deviceId, members, maybeClosePeerForMemberRemoval]);

  useEffect(() => {
    if (!micReady) return;
    if (!signalReady) return;

    const timer = window.setInterval(() => {
      if (isDocumentHidden()) return;
      healPeerConnections();
    }, voicePolicy.healIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [micReady, signalReady, healPeerConnections]);

  const prevAllVoiceStartReadyRef = useRef(false);
  const prevSettingsTurnSignalReadyRef = useRef(false);

  const isSettingsTurnSignalReady = useCallback((): boolean => {
    if (!signalReady || !voiceSettingsReadyRef.current) return false;
    if (voiceTransportDisabledRef.current) return false;
    if (relayForcedRef.current && !hasTurnIceServer(iceServersRef.current)) {
      return false;
    }
    const remoteIds = getRemoteIds().filter((remoteId) => isRemoteInCall(remoteId));
    return remoteIds.length > 0;
  }, [getRemoteIds, isRemoteInCall, signalReady]);

  const isAllVoiceStartReady = useCallback((): boolean => {
    if (!isSettingsTurnSignalReady()) return false;
    const receiveOnly = isReceiveOnlyMutedSession(
      voicePolicy.releaseMicOnMute,
      userMutedRef
    );
    const remoteIds = getRemoteIds().filter((remoteId) => isRemoteInCall(remoteId));
    const activeCanStart =
      micReady &&
      (isLocalTrackLive(localAudioTrackRef, localStreamRef) || receiveOnly);
    const passiveCanStart = remoteIds.some((remoteId) => deviceId > remoteId);
    return activeCanStart || passiveCanStart;
  }, [
    deviceId,
    getRemoteIds,
    isRemoteInCall,
    isSettingsTurnSignalReady,
    localAudioTrackRef,
    localStreamRef,
    micReady,
    userMutedRef,
  ]);

  const runStartAfterAllReady = useCallback(
    (trigger: string) => {
      if (!isAllVoiceStartReady()) return;

      for (const remoteId of getRemoteIds()) {
        if (!isRemoteInCall(remoteId)) continue;
        if (getEstablishedPeerSkipReasonForPeer(remoteId)) continue;
        debugConsoleLog(
          `[voice-peer] start-after-all-ready trigger=${trigger} remote=${compactDeviceId(remoteId)} ${formatVoiceModeSuffix()}`
        );
        if (deviceId < remoteId) {
          ensurePeerConnection(remoteId, trigger);
          continue;
        }
        const phase = getPeerNegotiationPhase(remoteId);
        if (shouldSuppressPassiveOfferReschedule(phase)) {
          continue;
        }
        if (phase === "idle_unnegotiated") {
          beginPassiveOfferWait(remoteId, trigger, { forceReschedule: true });
          continue;
        }
        ensurePeerConnection(remoteId, trigger);
      }
      scheduleDeferredHealPeerConnections(trigger);
    },
    [
      beginPassiveOfferWait,
      deviceId,
      ensurePeerConnection,
      getEstablishedPeerSkipReasonForPeer,
      getPeerNegotiationPhase,
      getRemoteIds,
      isAllVoiceStartReady,
      isRemoteInCall,
      scheduleDeferredHealPeerConnections,
    ]
  );

  useEffect(() => {
    const settingsReady = isSettingsTurnSignalReady();
    const allReady = isAllVoiceStartReady();
    const wasAllReady = prevAllVoiceStartReadyRef.current;
    const wasSettingsReady = prevSettingsTurnSignalReadyRef.current;
    prevAllVoiceStartReadyRef.current = allReady;
    prevSettingsTurnSignalReadyRef.current = settingsReady;

    if (allReady && !wasAllReady) {
      const receiveOnly = isReceiveOnlyMutedSession(
        voicePolicy.releaseMicOnMute,
        userMutedRef
      );
      const activeCanStart =
        micReady &&
        (isLocalTrackLive(localAudioTrackRef, localStreamRef) || receiveOnly);
      const trigger = activeCanStart ? "all_ready" : "settings_turn_signal_ready";
      runStartAfterAllReady(trigger);
      return;
    }

    if (settingsReady && !wasSettingsReady && !allReady) {
      const passiveCanStart = getRemoteIds()
        .filter((remoteId) => isRemoteInCall(remoteId))
        .some((remoteId) => deviceId > remoteId);
      if (passiveCanStart && !micReady) {
        runStartAfterAllReady("settings_turn_signal_ready");
      }
    }
  }, [
    deviceId,
    getRemoteIds,
    isAllVoiceStartReady,
    isRemoteInCall,
    isSettingsTurnSignalReady,
    localAudioTrackRef,
    localStreamRef,
    micReady,
    runStartAfterAllReady,
    settingsReadyTick,
    signalReady,
    turnReadyTick,
    userMutedRef,
    voiceMembersFingerprint,
    voicePolicy.releaseMicOnMute,
  ]);

  useEffect(() => {
    if (!micReady || !signalReady) return;

    const timer = window.setInterval(() => {
      if (isDocumentHidden()) return;
      flushPendingReconnectRequests();
      for (const remoteId of getRemoteIds()) {
        void evaluateAndRunVoiceSoftResetForPeer(remoteId);
        evaluateAndRunAutoHardResetForPeer(remoteId);
      }
    }, AUTO_HARD_RESET_EVAL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    evaluateAndRunAutoHardResetForPeer,
    evaluateAndRunVoiceSoftResetForPeer,
    flushPendingReconnectRequests,
    getRemoteIds,
    micReady,
    signalReady,
  ]);

  useEffect(() => {
    if (!signalReady) return;

    const timer = window.setInterval(() => {
      if (isDocumentHidden()) return;
      for (const remoteId of getRemoteIds()) {
        const pc = pcsRef.current.get(remoteId);
        if (
          !pc ||
          !isTransportMediaConnected(pc.connectionState, pc.iceConnectionState)
        ) {
          continue;
        }
        void pollPeerAudioDiagnostics(remoteId);
      }
    }, AUDIO_STATS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [getRemoteIds, pollPeerAudioDiagnostics, signalReady]);

  useEffect(() => {
    if (membersSyncRevision <= 0) return;
    if (isDocumentHidden()) return;
    const receiveOnly = isReceiveOnlyMutedSession(
      voicePolicy.releaseMicOnMute,
      userMutedRef
    );
    if (
      !micReady ||
      (!isLocalTrackLive(localAudioTrackRef, localStreamRef) && !receiveOnly)
    ) {
      return;
    }
    scheduleDeferredHealPeerConnections("members_updated");
    emitMeshSummary("members_updated", { immediate: true });
  }, [
    membersSyncRevision,
    emitMeshSummary,
    scheduleDeferredHealPeerConnections,
    localAudioTrackRef,
    localStreamRef,
    micReady,
    userMutedRef,
    voicePolicy.releaseMicOnMute,
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
      passiveFallbackOfferByConnRef.current.clear();
      passiveWaitOfferMetaRef.current.clear();

      for (const timer of answerWaitTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      answerWaitTimersRef.current.clear();
      answerWaitMetaRef.current.clear();
      answerWaitRetriedByConnRef.current.clear();

      activeOfferJoinLoggedRef.current.clear();
      softResetAttemptCountRef.current.clear();
      softResetLastAtRef.current.clear();
      softResetExhaustedNotifiedRef.current.clear();
      bidirectionalEstablishedRef.current.clear();
      peerAutoRecoveryFrozenRef.current.clear();

      for (const timer of iceCheckingTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      iceCheckingTimersRef.current.clear();

      for (const timer of iceDisconnectedGraceTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      iceDisconnectedGraceTimersRef.current.clear();

      for (const timer of pcDisconnectedGraceTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      pcDisconnectedGraceTimersRef.current.clear();

      for (const timer of connectingTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      connectingTimersRef.current.clear();

      for (const timer of connectedAudioConfirmTimersRef.current.values()) {
        window.clearTimeout(timer);
        timerCount += 1;
      }
      connectedAudioConfirmTimersRef.current.clear();
      connectedAudioConfirmArmedAtRef.current.clear();
      voiceStartCheckLastLogRef.current.clear();
      passiveJoinSettledRef.current.clear();
      offerEffectMembersFingerprintRef.current = "";
      lastPeerDiagnosticsEmitRef.current = { signature: "", atMs: 0 };

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
      loggedAudioStrictRef.current.clear();
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
      autoHardResetLastAtRef.current.clear();
      autoHardResetAttemptCountRef.current.clear();
      autoHardResetGiveUpRef.current.clear();
      autoHardResetInProgressRef.current.clear();
      p2pDirectFailedSignalAtRef.current.clear();
      p2pNoRelayRetryAttemptsRef.current.clear();
      p2pNoRelayRetryInFlightRef.current.clear();
      p2pNoRelaySelectedPairRef.current.clear();
      for (const timer of p2pNoRelayRetryFollowupTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      p2pNoRelayRetryFollowupTimersRef.current.clear();
      for (const timer of p2pRetryBackgroundTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      p2pRetryBackgroundTimersRef.current.clear();
      p2pRetryExhaustedRef.current.clear();
      p2pBackgroundRetryCycleRef.current.clear();
      manualHardResetHealPassRef.current.clear();
      for (const state of passiveReconnectStateRef.current.values()) {
        if (state.retryTimerId != null) {
          window.clearTimeout(state.retryTimerId);
        }
      }
      passiveReconnectStateRef.current.clear();

      setRemoteAudios({});
      emitPeerStatesRef.current();
      onVoiceCleanupRef.current?.();

      const vis =
        typeof document !== "undefined" ? document.visibilityState : "-";
      const memberCount = membersCountRef.current;

      const sid = String(sessionIdRef.current ?? "").slice(-6) || "-";
      const did = compactDeviceId(deviceIdRef.current);

      debugConsoleLog(
        `[voice-peer] ${logTag} reason=${reason} session=${sid} device=${did} ` +
          `pcs=${pcCount} timers=${timerCount} remoteAudios=${remoteAudioCount} ` +
          `members=${memberCount} vis=${vis} ${formatVoiceModeSuffix()}`
      );
      logVoicePipelineClassification(undefined, `cleanup ${logTag} reason=${reason}`);
    },
    []
  );

  useEffect(() => {
    const strict = getStrictRemoteIds();
    const remoteIds = getRemoteIds();
    const graceCount = remoteIds.length - strict.length;
    const sessionMemberIds = getSessionMemberRemoteIds();
    const uiInCall = members.filter((m) => m.is_in_call === true).length;
    debugConsoleLog(
      `[voice-peer] remote-ids-snapshot stable=${isStableVoiceJoinMode()} ` +
        `strict=${strict.length} grace=${graceCount} total=${remoteIds.length} ` +
        `sessionMembers=${sessionMemberIds.length} uiInCall=${uiInCall} ` +
        `strictIds=${strict.map((id) => compactDeviceId(id)).join(",") || "-"} ` +
        `allIds=${remoteIds.map((id) => compactDeviceId(id)).join(",") || "-"} ` +
        `members=${members
          .map(
            (m) =>
              `${String(m.device_id ?? "").slice(-4)}:inCall=${m.is_in_call === true ? 1 : 0}:screen=${String(m.screen ?? "-")}`
          )
          .join("|")}`
    );
    if (isStableVoiceJoinMode() && remoteIds.length < 1 && sessionMemberIds.length > 0) {
      debugConsoleLog(
        `[voice-peer] remote-ids-warning class=A reason=session_members_present_but_remoteIds_empty ` +
          `sessionMemberIds=${sessionMemberIds.map((id) => compactDeviceId(id)).join(",")}`
      );
      logVoicePipelineClassification(undefined, "remote-ids-empty-with-session-members");
    }
  }, [
    getRemoteIds,
    getSessionMemberRemoteIds,
    getStrictRemoteIds,
    members,
    membersSyncRevision,
  ]);

  useEffect(() => {
    membersCountRef.current = members.length;
  }, [members.length]);

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
      if (isDocumentHidden()) return;
      const remoteIds = getRemoteIds();

      for (const remoteId of remoteIds) {
        const hasRemoteStream = hasLiveRemoteAudioStream(remoteId);
        const pc = pcsRef.current.get(remoteId);

        if (hasRemoteStream) continue;
        if (!pc) continue;

        const conn = pc.connectionState;
        const ice = pc.iceConnectionState;
        const isPcDisconnected = isPeerPcDisconnectedOnly({ conn });
        const isIceDisconnected = isPeerIceDisconnectedOnly({ conn, ice });

        if (isPcDisconnected || isIceDisconnected) {
          const suppress = evaluateIceDisconnectedReconnectSuppressReason(
            buildIceDisconnectedGuardInput(remoteId, pc)
          );
          if (suppress) continue;
          if (
            iceDisconnectedGraceTimersRef.current.has(remoteId) ||
            pcDisconnectedGraceTimersRef.current.has(remoteId)
          ) {
            continue;
          }
        }

        const badState =
          conn === "failed" ||
          ice === "failed" ||
          isPcDisconnected ||
          isIceDisconnected;

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
  }, [
    buildIceDisconnectedGuardInput,
    members,
    micReady,
    signalReady,
    deviceId,
    scheduleReconnect,
    getRemoteIds,
  ]);

  return {
    remoteAudios,
    handleSignal,
    handleRemotePlaybackHealthChange,
    handlePlaybackUnconfirmedTimeout,
    manualPeerHardReset,
    applyLocalAudioTrack,
  };
}