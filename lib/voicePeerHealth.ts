import { isDebugLogEnabled, logDebug } from "@/lib/debugLog";
import type { VoiceSoftResetTriggerReason } from "@/lib/voiceSoftReset";
import { VOICE_JOIN_STABILIZATION_MS } from "@/lib/voiceJoinTiming";

/** Wait before treating missing strict confirm as unhealthy (10–12s window). */
export const VOICE_PEER_HEALTH_UNCONFIRMED_MS = 11_000;

/** remote_track applied but inbound packets flat for this long → stalled. */
export const VOICE_PEER_HEALTH_STALLED_INBOUND_MS = 5_000;

/** Minimum gap between repair actions for the same remote peer. */
export const VOICE_PEER_HEALTH_REPAIR_COOLDOWN_MS = 8_000;

export const VOICE_PEER_HEALTH_MAX_RECONNECT_REQUESTS = 1;

export const VOICE_PEER_HEALTH_TRANSPORT_STUCK_MS = 15_000;
export const VOICE_PEER_HEALTH_ORPHAN_MS = 5_000;
export const VOICE_PEER_HEALTH_P2P_FAILED_WINDOW_MS = 5_000;

export type VoicePeerHealthClassification =
  | "healthy"
  | "unconfirmed"
  | "stalled"
  | "dead";

export type VoicePeerRepairStage =
  | "observe"
  | "reconnect_request"
  | "soft_reset"
  | "hard_reset"
  | "give_up";

export type VoicePeerHealthEntry = {
  firstSeenAt: number;
  lastAudioConfirmedAt: number | null;
  lastRemoteTrackAt: number | null;
  lastInboundPacketAt: number | null;
  lastRepairAt: number | null;
  retryCount: number;
  repairStage: VoicePeerRepairStage;
  lastFailureReason: string | null;
  reconnectRequestCount: number;
  lastHealthLogAt: number | null;
  lastHealthLogKey: string | null;
};

export type VoicePeerSignalTimestamps = {
  lastPlaybackConfirmedAt: number | null;
  lastPlaybackActiveAt: number | null;
  lastPlaySuccessAt: number | null;
  lastOnTrackAt: number | null;
};

export type VoicePeerHealthSnapshot = {
  nowMs: number;
  remoteId: string;
  joinAgeMs: number;
  peerAgeMs: number;
  audioConfirmedStrict: boolean;
  hasPlaybackEvidence: boolean;
  iceConnected: boolean;
  remoteTrackReceived: boolean;
  remoteTrackMuted: boolean;
  inboundDeltaPackets: number;
  inboundDeltaBytes: number;
  outboundDeltaBytes: number;
  connectionState: string;
  iceConnectionState: string;
  awaitingActiveOffer: boolean;
  awaitingRemoteAnswer: boolean;
  softResetExhausted: boolean;
  hardResetExhausted: boolean;
  hardResetGiveUp: boolean;
  softResetBlocked: boolean;
  autoRecoveryFrozen: boolean;
  negotiationComplete: boolean;
  transportFailureReason: string | null;
};

export type VoicePeerRepairAction = {
  stage: Exclude<VoicePeerRepairStage, "observe">;
  reason: string;
  softResetTrigger?: VoiceSoftResetTriggerReason;
  hardResetTrigger?: string;
};

export function createVoicePeerHealthEntry(nowMs: number): VoicePeerHealthEntry {
  return {
    firstSeenAt: nowMs,
    lastAudioConfirmedAt: null,
    lastRemoteTrackAt: null,
    lastInboundPacketAt: null,
    lastRepairAt: null,
    retryCount: 0,
    repairStage: "observe",
    lastFailureReason: null,
    reconnectRequestCount: 0,
    lastHealthLogAt: null,
    lastHealthLogKey: null,
  };
}

export function updateVoicePeerHealthObservations(
  entry: VoicePeerHealthEntry,
  snapshot: Pick<
    VoicePeerHealthSnapshot,
    "nowMs" | "audioConfirmedStrict" | "remoteTrackReceived" | "inboundDeltaPackets"
  >
): void {
  if (snapshot.audioConfirmedStrict) {
    clearVoicePeerHealthOnAudioConfirmedStrict(entry, snapshot.nowMs);
  }
  if (snapshot.remoteTrackReceived && entry.lastRemoteTrackAt == null) {
    entry.lastRemoteTrackAt = snapshot.nowMs;
  }
  if (snapshot.inboundDeltaPackets > 0) {
    entry.lastInboundPacketAt = snapshot.nowMs;
  }
}

export function clearVoicePeerHealthOnAudioConfirmedStrict(
  entry: VoicePeerHealthEntry,
  nowMs: number
): void {
  entry.lastAudioConfirmedAt = nowMs;
  entry.repairStage = "observe";
  entry.lastFailureReason = null;
  entry.reconnectRequestCount = 0;
  entry.retryCount = 0;
  entry.lastRepairAt = null;
}

const STRONG_TRANSPORT_DEAD_REASONS = new Set([
  "transport_failed",
  "ice_disconnected_sustained",
  "p2p_direct_failed",
]);

export function isVoicePeerAudioEstablishedProtected(params: {
  snapshot: Pick<
    VoicePeerHealthSnapshot,
    "audioConfirmedStrict" | "autoRecoveryFrozen" | "hasPlaybackEvidence"
  >;
  entry: Pick<VoicePeerHealthEntry, "lastAudioConfirmedAt">;
}): boolean {
  return (
    params.snapshot.audioConfirmedStrict ||
    params.entry.lastAudioConfirmedAt != null ||
    (params.snapshot.autoRecoveryFrozen && params.snapshot.hasPlaybackEvidence)
  );
}

export function isStrongVoicePeerTransportDeadReason(reason: string): boolean {
  return STRONG_TRANSPORT_DEAD_REASONS.has(reason);
}

export function shouldSkipVoicePeerRepair(params: {
  snapshot: VoicePeerHealthSnapshot;
  entry: VoicePeerHealthEntry;
  classification: { state: VoicePeerHealthClassification; reason: string };
}): string | null {
  const { snapshot, entry, classification } = params;

  if (
    classification.state === "unconfirmed" &&
    classification.reason === "audio_confirmed_strict_pending"
  ) {
    if (snapshot.hasPlaybackEvidence || snapshot.autoRecoveryFrozen) {
      return "playback_evidence_pending";
    }
  }

  if (!isVoicePeerAudioEstablishedProtected({ snapshot, entry })) {
    return null;
  }

  if (classification.state === "healthy") {
    return "already_audio_confirmed";
  }

  if (classification.state === "dead") {
    return isStrongVoicePeerTransportDeadReason(classification.reason)
      ? null
      : "already_audio_confirmed";
  }

  return "already_audio_confirmed";
}

function hasActivePlaybackWithoutConfirmation(
  timestamps: VoicePeerSignalTimestamps
): boolean {
  return (
    timestamps.lastPlaybackConfirmedAt == null &&
    (timestamps.lastPlaySuccessAt != null ||
      timestamps.lastPlaybackActiveAt != null)
  );
}

export function evaluateVoicePeerTransportFailure(params: {
  connectionState: string;
  iceConnectionState: string;
  signalingState: string;
  timestamps: VoicePeerSignalTimestamps;
  hasRemoteStream: boolean;
  hasPc: boolean;
  isOrphan: boolean;
  orphanSince: number | null;
  connectStartedAt: number | null;
  p2pDirectFailedAt: number | null;
  nowMs: number;
  awaitingRemoteAnswer?: boolean;
}): string | null {
  const conn = params.connectionState;
  const ice = params.iceConnectionState;
  const sig = params.signalingState;

  if (params.awaitingRemoteAnswer) return null;

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
    params.nowMs - params.p2pDirectFailedAt <= VOICE_PEER_HEALTH_P2P_FAILED_WINDOW_MS
  ) {
    return "p2p_direct_failed";
  }

  if (params.isOrphan || (!params.hasPc && params.hasRemoteStream)) {
    if (
      params.orphanSince != null &&
      params.nowMs - params.orphanSince >= VOICE_PEER_HEALTH_ORPHAN_MS
    ) {
      return "orphan_remote_audio_provisional";
    }
  }

  const connectAgeMs =
    params.connectStartedAt != null
      ? params.nowMs - params.connectStartedAt
      : null;
  const isConnectingChecking =
    conn === "connecting" || ice === "checking" || ice === "new";

  if (
    hasActivePlaybackWithoutConfirmation(params.timestamps) &&
    isConnectingChecking
  ) {
    return null;
  }

  if (
    isConnectingChecking &&
    connectAgeMs != null &&
    connectAgeMs >= VOICE_PEER_HEALTH_TRANSPORT_STUCK_MS
  ) {
    return "connecting_checking_stuck";
  }

  if (params.timestamps.lastPlaybackConfirmedAt == null) {
    const anchor =
      params.connectStartedAt ??
      params.timestamps.lastOnTrackAt ??
      params.timestamps.lastPlaybackActiveAt;
    if (
      anchor != null &&
      params.nowMs - anchor >= VOICE_PEER_HEALTH_TRANSPORT_STUCK_MS &&
      !hasActivePlaybackWithoutConfirmation(params.timestamps)
    ) {
      return "confirmed_at_missing";
    }
  }

  if (
    params.timestamps.lastPlaybackActiveAt != null &&
    params.timestamps.lastPlaybackConfirmedAt == null &&
    params.nowMs - params.timestamps.lastPlaybackActiveAt >=
      VOICE_PEER_HEALTH_TRANSPORT_STUCK_MS &&
    !isConnectingChecking
  ) {
    return "playback_provisional_unconfirmed";
  }

  if (
    ice === "disconnected" &&
    connectAgeMs != null &&
    connectAgeMs >= VOICE_PEER_HEALTH_STALLED_INBOUND_MS
  ) {
    return "ice_disconnected_sustained";
  }

  return null;
}

export function classifyVoicePeerHealth(
  snapshot: VoicePeerHealthSnapshot,
  entry: VoicePeerHealthEntry
): { state: VoicePeerHealthClassification; reason: string } {
  if (snapshot.audioConfirmedStrict) {
    return { state: "healthy", reason: "audio_confirmed_strict" };
  }
  if (snapshot.hasPlaybackEvidence && snapshot.autoRecoveryFrozen) {
    return { state: "healthy", reason: "playback_evidence" };
  }

  if (entry.lastAudioConfirmedAt != null) {
    if (snapshot.transportFailureReason) {
      if (isStrongVoicePeerTransportDeadReason(snapshot.transportFailureReason)) {
        return { state: "dead", reason: snapshot.transportFailureReason };
      }
    }
    if (
      snapshot.connectionState === "failed" ||
      snapshot.iceConnectionState === "failed"
    ) {
      return { state: "dead", reason: "transport_failed" };
    }
    if (
      snapshot.iceConnectionState === "disconnected" &&
      snapshot.iceConnected === false
    ) {
      return { state: "dead", reason: "ice_disconnected_sustained" };
    }
    if (snapshot.remoteTrackReceived && snapshot.remoteTrackMuted) {
      return { state: "stalled", reason: "remote_track_muted" };
    }
    return { state: "healthy", reason: "audio_confirmed_strict_frozen" };
  }

  if (snapshot.transportFailureReason) {
    return { state: "dead", reason: snapshot.transportFailureReason };
  }

  if (
    snapshot.connectionState === "failed" ||
    snapshot.iceConnectionState === "failed"
  ) {
    return { state: "dead", reason: "transport_failed" };
  }

  if (snapshot.iceConnectionState === "disconnected" && snapshot.iceConnected === false) {
    return { state: "dead", reason: "ice_disconnected_sustained" };
  }

  if (snapshot.remoteTrackReceived && snapshot.remoteTrackMuted) {
    return { state: "stalled", reason: "remote_track_muted" };
  }

  if (
    snapshot.remoteTrackReceived &&
    snapshot.iceConnected &&
    snapshot.inboundDeltaPackets <= 0 &&
    !snapshot.hasPlaybackEvidence
  ) {
    const anchor = entry.lastRemoteTrackAt ?? entry.firstSeenAt;
    if (snapshot.nowMs - anchor >= VOICE_PEER_HEALTH_STALLED_INBOUND_MS) {
      return { state: "stalled", reason: "track_applied_no_inbound_packets" };
    }
  }

  if (!snapshot.remoteTrackReceived && snapshot.iceConnected) {
    if (snapshot.peerAgeMs >= VOICE_PEER_HEALTH_UNCONFIRMED_MS) {
      return { state: "unconfirmed", reason: "remote_track_missing" };
    }
  }

  if (
    snapshot.iceConnected &&
    snapshot.peerAgeMs >= VOICE_PEER_HEALTH_UNCONFIRMED_MS
  ) {
    if (snapshot.hasPlaybackEvidence || snapshot.autoRecoveryFrozen) {
      return { state: "healthy", reason: "playback_evidence_pending_strict" };
    }
    return { state: "unconfirmed", reason: "audio_confirmed_strict_pending" };
  }

  return { state: "healthy", reason: "observe" };
}

function mapStalledReasonToSoftReset(
  reason: string
): VoiceSoftResetTriggerReason {
  if (reason === "remote_track_muted") return "track_no_playback_evidence";
  if (reason === "track_applied_no_inbound_packets") {
    return "track_no_playback_evidence";
  }
  return "bidirectional_not_established";
}

export function evaluateVoicePeerRepairAction(params: {
  snapshot: VoicePeerHealthSnapshot;
  entry: VoicePeerHealthEntry;
  classification: { state: VoicePeerHealthClassification; reason: string };
}): VoicePeerRepairAction | null {
  const { snapshot, entry, classification } = params;

  const skipReason = shouldSkipVoicePeerRepair(params);
  if (skipReason) {
    logVoicePeerHealthSkip({
      remoteId: snapshot.remoteId,
      reason: skipReason,
      classificationReason: classification.reason,
    });
    return null;
  }

  if (classification.state === "healthy") return null;
  if (snapshot.hardResetGiveUp || entry.repairStage === "give_up") return null;
  if (snapshot.awaitingActiveOffer) return null;
  if (snapshot.awaitingRemoteAnswer) return null;
  if (snapshot.softResetBlocked) return null;
  if (snapshot.joinAgeMs < VOICE_JOIN_STABILIZATION_MS) return null;
  if (snapshot.peerAgeMs < VOICE_JOIN_STABILIZATION_MS) return null;

  if (
    entry.lastRepairAt != null &&
    snapshot.nowMs - entry.lastRepairAt < VOICE_PEER_HEALTH_REPAIR_COOLDOWN_MS
  ) {
    return null;
  }

  if (classification.state === "dead") {
    if (snapshot.hardResetExhausted) {
      return { stage: "give_up", reason: classification.reason };
    }
    return {
      stage: "hard_reset",
      reason: classification.reason,
      hardResetTrigger: classification.reason,
    };
  }

  if (classification.state === "stalled") {
    if (!snapshot.softResetExhausted) {
      return {
        stage: "soft_reset",
        reason: classification.reason,
        softResetTrigger: mapStalledReasonToSoftReset(classification.reason),
      };
    }
    if (!snapshot.hardResetExhausted) {
      return {
        stage: "hard_reset",
        reason: classification.reason,
        hardResetTrigger: classification.reason,
      };
    }
    return { stage: "give_up", reason: classification.reason };
  }

  if (classification.state === "unconfirmed") {
    if (entry.reconnectRequestCount < VOICE_PEER_HEALTH_MAX_RECONNECT_REQUESTS) {
      return { stage: "reconnect_request", reason: classification.reason };
    }
    if (!snapshot.softResetExhausted) {
      return {
        stage: "soft_reset",
        reason: classification.reason,
        softResetTrigger: snapshot.remoteTrackReceived
          ? "bidirectional_not_established"
          : "no_remote_track_ice_connected",
      };
    }
    if (!snapshot.hardResetExhausted) {
      return {
        stage: "hard_reset",
        reason: "unconfirmed_exhausted",
        hardResetTrigger: "confirmed_at_missing",
      };
    }
    return { stage: "give_up", reason: classification.reason };
  }

  return null;
}

export function recordVoicePeerRepairAction(
  entry: VoicePeerHealthEntry,
  action: VoicePeerRepairAction,
  nowMs: number
): void {
  entry.lastRepairAt = nowMs;
  entry.retryCount += 1;
  entry.repairStage = action.stage;
  entry.lastFailureReason = action.reason;
  if (action.stage === "reconnect_request") {
    entry.reconnectRequestCount += 1;
  }
}

export function isVoicePeerRepairInProgress(entry: VoicePeerHealthEntry | null): boolean {
  if (!entry) return false;
  return (
    entry.repairStage === "reconnect_request" ||
    entry.repairStage === "soft_reset" ||
    entry.repairStage === "hard_reset"
  );
}

export function logVoicePeerHealth(params: {
  remoteId: string;
  state: VoicePeerHealthClassification;
  reason: string;
  repairStage: VoicePeerRepairStage;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "call",
    `[voice-peer-health] remote=${params.remoteId.slice(-4)} ` +
      `state=${params.state} reason=${params.reason} stage=${params.repairStage}`
  );
}

export function logVoicePeerRepair(params: {
  remoteId: string;
  stage: VoicePeerRepairStage;
  reason: string;
  success?: boolean;
}) {
  if (!isDebugLogEnabled()) return;
  const suffix = params.success ? " success" : "";
  logDebug(
    "call",
    `[voice-peer-repair] remote=${params.remoteId.slice(-4)} ` +
      `stage=${params.stage} reason=${params.reason}${suffix}`
  );
}

export function logVoicePeerHealthSkip(params: {
  remoteId: string;
  reason: string;
  classificationReason?: string;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "call",
    `[voice-peer-health] skip remote=${params.remoteId.slice(-4)} ` +
      `reason=${params.reason}` +
      (params.classificationReason
        ? ` classification=${params.classificationReason}`
        : "")
  );
}

export function logVoicePeerRepairClear(params: {
  remoteId: string;
  reason: string;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "call",
    `[voice-peer-repair] clear remote=${params.remoteId.slice(-4)} ` +
      `reason=${params.reason}`
  );
}

export function logVoicePeerRepairFrozen(params: {
  remoteId: string;
  reason: string;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "call",
    `[voice-peer-repair] frozen remote=${params.remoteId.slice(-4)} ` +
      `reason=${params.reason}`
  );
}

export function shouldSuppressInboundHealthReconnectRequest(params: {
  resetReason: string;
  incomingConnectionId: string;
  currentConnectionId: string | null;
  audioConfirmedStrict: boolean;
  autoRecoveryFrozen: boolean;
  hasPlaybackEvidence: boolean;
  transportDead: boolean;
}): boolean {
  const resetReason = String(params.resetReason ?? "").trim();
  const pendingHealthReconnect =
    resetReason === "health_audio_confirmed_strict_pending" ||
    resetReason.endsWith("audio_confirmed_strict_pending");

  if (!pendingHealthReconnect) return false;

  const sameConnection =
    params.currentConnectionId != null &&
    params.incomingConnectionId === params.currentConnectionId;
  if (!sameConnection) return false;

  if (params.transportDead) return false;

  return (
    params.audioConfirmedStrict ||
    params.autoRecoveryFrozen ||
    params.hasPlaybackEvidence
  );
}

export function logVoicePeerRepairSuppressInboundReconnect(params: {
  remoteId: string;
  reason: string;
  resetReason: string;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "call",
    `[voice-peer-repair] suppress-inbound-reconnect remote=${params.remoteId.slice(-4)} ` +
      `reason=${params.reason} resetReason=${params.resetReason}`
  );
}
