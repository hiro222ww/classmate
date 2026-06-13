"use client";

import type { OneWayAudioSubClass } from "@/lib/voiceAudioDiagnostics";

export const UI_CONNECTED_SOFT_HOLD_MS = 8000;
export const UI_CONNECTED_STRICT_HOLD_MS = 15000;
export const RECOVERY_INBOUND_STALL_MS = 12000;
export const RECOVERY_D5_UNMUTED_MS = 4000;
export const RECOVERY_CONN_DEGRADED_MS = 5000;
export const RECOVERY_REMOTE_TRACK_MUTED_MS = 10000;
export const RECOVERY_ELEMENT_PAUSED_MS = 8000;

export type PeerConnectedHoldRecord = {
  softAtMs: number | null;
  strictAtMs: number | null;
  lastInboundAtMs: number | null;
  d5UnmutedSinceMs: number | null;
  connDegradedSinceMs: number | null;
};

export function emptyPeerConnectedHoldRecord(): PeerConnectedHoldRecord {
  return {
    softAtMs: null,
    strictAtMs: null,
    lastInboundAtMs: null,
    d5UnmutedSinceMs: null,
    connDegradedSinceMs: null,
  };
}

export function markPeerConnectedSoft(
  record: PeerConnectedHoldRecord,
  nowMs: number
): PeerConnectedHoldRecord {
  if (record.softAtMs != null) return record;
  return { ...record, softAtMs: nowMs };
}

export function markPeerConnectedStrict(
  record: PeerConnectedHoldRecord,
  nowMs: number
): PeerConnectedHoldRecord {
  return {
    ...record,
    strictAtMs: nowMs,
    softAtMs: record.softAtMs ?? nowMs,
  };
}

export function getPeerConnectedUiHoldMs(
  record: PeerConnectedHoldRecord,
  nowMs: number
): number {
  if (record.strictAtMs != null) {
    return Math.max(0, UI_CONNECTED_STRICT_HOLD_MS - (nowMs - record.strictAtMs));
  }
  if (record.softAtMs != null) {
    return Math.max(0, UI_CONNECTED_SOFT_HOLD_MS - (nowMs - record.softAtMs));
  }
  return 0;
}

export function isPeerUiConnectedHoldActive(
  record: PeerConnectedHoldRecord,
  nowMs: number
): boolean {
  return getPeerConnectedUiHoldMs(record, nowMs) > 0;
}

const TRANSIENT_SUB_CLASSES = new Set<OneWayAudioSubClass>([
  "D2",
  "D3",
  "D5",
  "D6",
]);

export function shouldSuppressTransientSubClassDuringHold(
  subClass: OneWayAudioSubClass,
  record: PeerConnectedHoldRecord,
  nowMs: number
): boolean {
  if (!TRANSIENT_SUB_CLASSES.has(subClass)) return false;
  return isPeerUiConnectedHoldActive(record, nowMs);
}

export function maskSubClassDuringConnectedHold(
  subClass: OneWayAudioSubClass,
  record: PeerConnectedHoldRecord,
  nowMs: number
): OneWayAudioSubClass {
  if (shouldSuppressTransientSubClassDuringHold(subClass, record, nowMs)) {
    return "OK";
  }
  return subClass;
}

export function notePeerInboundActivity(
  record: PeerConnectedHoldRecord,
  nowMs: number,
  deltaInboundBytes: number,
  deltaInboundPackets: number
): PeerConnectedHoldRecord {
  if (deltaInboundBytes > 0 || deltaInboundPackets > 0) {
    return { ...record, lastInboundAtMs: nowMs };
  }
  return record;
}

export function notePeerConnectionState(
  record: PeerConnectedHoldRecord,
  nowMs: number,
  conn: string,
  ice: string
): PeerConnectedHoldRecord {
  const degraded =
    conn === "failed" ||
    conn === "disconnected" ||
    ice === "failed" ||
    ice === "disconnected";
  if (!degraded) {
    if (record.connDegradedSinceMs == null) return record;
    return { ...record, connDegradedSinceMs: null };
  }
  if (record.connDegradedSinceMs != null) return record;
  return { ...record, connDegradedSinceMs: nowMs };
}

export function notePeerD5UnmutedCandidate(
  record: PeerConnectedHoldRecord,
  nowMs: number,
  isD5Candidate: boolean
): PeerConnectedHoldRecord {
  if (!isD5Candidate) {
    if (record.d5UnmutedSinceMs == null) return record;
    return { ...record, d5UnmutedSinceMs: null };
  }
  if (record.d5UnmutedSinceMs != null) return record;
  return { ...record, d5UnmutedSinceMs: nowMs };
}

export type SevereConnectedAnomalyInput = {
  nowMs: number;
  record: PeerConnectedHoldRecord;
  conn: string;
  ice: string;
  remoteTrackReadyState?: string;
  remoteTrackMuted?: boolean;
  elementPaused?: boolean;
  playSuccess?: boolean;
  currentTimeAdvanced?: boolean;
  inboundDeltaBytes?: number;
  inboundDeltaPackets?: number;
};

export function evaluateSevereConnectedAnomaly(
  input: SevereConnectedAnomalyInput
): { severe: boolean; reason: string | null } {
  const { record, nowMs } = input;

  if (input.remoteTrackReadyState === "ended") {
    return { severe: true, reason: "remote_track_ended" };
  }

  if (
    record.connDegradedSinceMs != null &&
    nowMs - record.connDegradedSinceMs >= RECOVERY_CONN_DEGRADED_MS
  ) {
    return { severe: true, reason: "connection_degraded_sustained" };
  }

  if (
    input.remoteTrackMuted === true &&
    record.lastInboundAtMs != null &&
    nowMs - record.lastInboundAtMs >= RECOVERY_REMOTE_TRACK_MUTED_MS
  ) {
    return { severe: true, reason: "remote_track_muted_sustained" };
  }

  if (
    record.lastInboundAtMs != null &&
    nowMs - record.lastInboundAtMs >= RECOVERY_INBOUND_STALL_MS
  ) {
    return { severe: true, reason: "inbound_rtp_stall" };
  }

  if (
    input.elementPaused === true &&
    input.playSuccess !== true &&
    (input.inboundDeltaBytes ?? 0) > 0
  ) {
    return { severe: true, reason: "element_paused_with_inbound" };
  }

  if (
    input.elementPaused === true &&
    input.playSuccess === true &&
    input.currentTimeAdvanced !== true &&
    (input.inboundDeltaBytes ?? 0) > 0 &&
    record.strictAtMs != null &&
    nowMs - record.strictAtMs >= RECOVERY_ELEMENT_PAUSED_MS
  ) {
    return { severe: true, reason: "element_paused_play_stuck" };
  }

  return { severe: false, reason: null };
}

export function shouldAllowConnectedRecovery(params: {
  nowMs: number;
  record: PeerConnectedHoldRecord;
  subClass: OneWayAudioSubClass;
  userIntentionallyMuted: boolean;
  severe: SevereConnectedAnomalyInput;
}): boolean {
  const anomaly = evaluateSevereConnectedAnomaly(params.severe);
  if (anomaly.severe) return true;

  if (params.record.strictAtMs == null && params.record.softAtMs == null) {
    return true;
  }

  if (params.subClass === "D5") {
    if (params.userIntentionallyMuted) return false;
    const since = params.record.d5UnmutedSinceMs;
    if (since == null || params.nowMs - since < RECOVERY_D5_UNMUTED_MS) {
      return false;
    }
    return true;
  }

  if (TRANSIENT_SUB_CLASSES.has(params.subClass)) {
    return false;
  }

  if (params.subClass === "D1" || params.subClass === "D4" || params.subClass === "D6") {
    return !isPeerUiConnectedHoldActive(params.record, params.nowMs);
  }

  return false;
}
