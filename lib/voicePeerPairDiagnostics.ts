"use client";

import { compactDeviceId } from "@/app/call/voice/voiceDiagnostics";
import type { OneWayAudioSubClass } from "@/lib/voiceAudioDiagnostics";
import type { VoicePipelineFailureClass } from "@/lib/voicePerf";
import type { VoicePeerPairSnapshot } from "@/lib/voicePeerPairRegistry";

export type VoicePeerPairDiagCache = {
  subClass: OneWayAudioSubClass | null;
  inboundDeltaBytes: number;
  outboundDeltaBytes: number;
  lastCloseReason: string | null;
  trackLive: boolean;
  currentTimeAdvanced: boolean;
  paused: boolean;
  updatedAt: number;
};

const diagCache = new Map<string, VoicePeerPairDiagCache>();

function diagCacheKey(
  remoteId: string,
  connectionId?: string | null
): string {
  const remote = compactDeviceId(remoteId);
  const conn = String(connectionId ?? "").trim();
  return conn ? `${remote}:${conn}` : remote;
}

function emptyDiagCache(): VoicePeerPairDiagCache {
  return {
    subClass: null,
    inboundDeltaBytes: 0,
    outboundDeltaBytes: 0,
    lastCloseReason: null,
    trackLive: false,
    currentTimeAdvanced: false,
    paused: false,
    updatedAt: 0,
  };
}

export function resetVoicePeerPairDiag(remoteId?: string) {
  if (!remoteId) {
    diagCache.clear();
    return;
  }
  const remote = compactDeviceId(remoteId);
  for (const key of Array.from(diagCache.keys())) {
    if (key === remote || key.startsWith(`${remote}:`)) {
      diagCache.delete(key);
    }
  }
}

export function updateVoicePeerPairDiag(
  remoteId: string,
  patch: Partial<VoicePeerPairDiagCache>,
  connectionId?: string | null
) {
  const key = diagCacheKey(remoteId, connectionId);
  const prev = diagCache.get(key) ?? emptyDiagCache();
  diagCache.set(key, {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  });
}

export function getVoicePeerPairDiag(
  remoteId: string,
  connectionId?: string | null
): VoicePeerPairDiagCache | null {
  if (connectionId) {
    return diagCache.get(diagCacheKey(remoteId, connectionId)) ?? null;
  }
  const remote = compactDeviceId(remoteId);
  let latest: VoicePeerPairDiagCache | null = null;
  for (const [key, value] of diagCache.entries()) {
    if (key !== remote && !key.startsWith(`${remote}:`)) continue;
    if (!latest || value.updatedAt >= latest.updatedAt) {
      latest = value;
    }
  }
  return latest;
}

export function detectSignalingAsymmetry(snap: {
  role: "active" | "passive";
  offerSent: boolean;
  offerReceived: boolean;
  answerSent: boolean;
  answerReceived: boolean;
  iceSent: boolean;
  iceReceived: boolean;
  iceConnected: boolean;
  msSinceConnectStart: number | null;
}): string | null {
  const aged =
    snap.msSinceConnectStart != null && snap.msSinceConnectStart >= 4_000;

  if (snap.role === "active") {
    if (snap.offerReceived && !snap.offerSent) return "both_active_glare";
    if (aged && !snap.offerSent) return "offer_sent_missing";
    if (snap.offerSent && aged && !snap.answerReceived) {
      return "answer_received_missing";
    }
  }

  if (snap.role === "passive") {
    if (snap.offerSent && !snap.offerReceived) return "passive_sent_offer";
    if (aged && !snap.offerReceived) return "offer_received_missing";
    if (snap.offerReceived && aged && !snap.answerSent) {
      return "answer_sent_missing";
    }
  }

  if (snap.iceSent && !snap.iceReceived && aged) return "ice_received_missing";
  if (snap.iceReceived && !snap.iceSent && aged) return "ice_sent_missing";

  return null;
}

export function enrichPeerVoiceClass(
  baseClass: VoicePipelineFailureClass,
  snap: {
    iceConnected: boolean;
    audioConfirmedStrict: boolean;
    remoteTrackReceived: boolean;
  },
  subClass: OneWayAudioSubClass | null,
  signalingIssue: string | null
): { voiceClass: VoicePipelineFailureClass; subClass: OneWayAudioSubClass | null } {
  if (signalingIssue && baseClass !== "E" && baseClass !== "A") {
    return { voiceClass: "B", subClass: null };
  }

  if (
    snap.iceConnected &&
    !snap.audioConfirmedStrict &&
    subClass &&
    subClass !== "OK"
  ) {
    return { voiceClass: "D", subClass };
  }

  if (baseClass === "D" && subClass && subClass !== "OK") {
    return { voiceClass: "D", subClass };
  }

  if (snap.iceConnected && snap.audioConfirmedStrict) {
    return { voiceClass: "OK", subClass: null };
  }

  if (!snap.iceConnected) {
    return { voiceClass: baseClass === "E" ? "E" : "C", subClass: null };
  }

  if (!snap.audioConfirmedStrict) {
    return {
      voiceClass: "D",
      subClass: subClass && subClass !== "OK" ? subClass : null,
    };
  }

  return { voiceClass: baseClass, subClass: null };
}

export type VoicePairClassifyEntry = {
  class: VoicePipelineFailureClass;
  subClass: OneWayAudioSubClass | null;
  route: VoicePeerPairSnapshot["route"];
  audio: "strict" | "provisional" | "pending" | "failed";
  role: VoicePeerPairSnapshot["role"];
  signalingIssue: string | null;
  iceConnected: boolean;
  remoteTrackReceived: boolean;
};

export function buildPairClassifyEntry(
  pair: VoicePeerPairSnapshot
): VoicePairClassifyEntry {
  const audio: VoicePairClassifyEntry["audio"] = pair.audioConfirmedStrict
    ? "strict"
    : pair.audioProvisional
      ? "provisional"
      : pair.subClass && pair.subClass !== "OK"
        ? "failed"
        : pair.iceConnected
          ? "pending"
          : "pending";

  return {
    class: pair.voiceClass,
    subClass: pair.subClass,
    route: pair.route,
    audio,
    role: pair.role,
    signalingIssue: pair.signalingIssue,
    iceConnected: pair.iceConnected,
    remoteTrackReceived: pair.remoteTrackReceived,
  };
}

export function computeOverallPairStatus(
  pairs: VoicePeerPairSnapshot[]
): "OK" | "partial" | "failed" {
  if (pairs.length === 0) return "failed";

  const okCount = pairs.filter(
    (pair) => pair.voiceClass === "OK" && pair.audioConfirmedStrict
  ).length;

  if (okCount === pairs.length) return "OK";
  if (okCount > 0) return "partial";
  return "failed";
}

export function formatAdminPairSummaryLine(pair: VoicePeerPairSnapshot): string {
  const remote = compactDeviceId(pair.remoteDeviceId);
  const route =
    pair.route === "turn"
      ? "TURN"
      : pair.route === "p2p"
        ? "P2P"
        : "unknown";

  if (pair.voiceClass === "OK" && pair.audioConfirmedStrict) {
    return `${remote}: ${route} / OK / audio OK`;
  }

  if (pair.voiceClass === "OK" && pair.iceConnected && !pair.audioConfirmedStrict) {
    const sub = pair.subClass && pair.subClass !== "OK" ? pair.subClass : null;
    if (sub) {
      const playback =
        sub === "D3" || sub === "D4"
          ? "playback NG"
          : sub === "D1" || sub === "D2"
            ? "track NG"
            : "audio pending";
      return `${remote}: ${route} / failed(${sub}) / ${playback}`;
    }
    return `${remote}: ${route} / OK / audio pending`;
  }

  if (pair.voiceClass !== "OK") {
    const detail =
      pair.signalingIssue === "answer_received_missing" ||
      pair.signalingIssue === "answer_sent_missing"
        ? "answer missing"
        : pair.signalingIssue === "offer_received_missing" ||
            pair.signalingIssue === "offer_sent_missing"
          ? "offer missing"
          : pair.signalingIssue === "ice_received_missing" ||
              pair.signalingIssue === "ice_sent_missing"
            ? "ice missing"
            : pair.signalingIssue === "both_active_glare"
              ? "both active"
              : pair.signalingIssue === "passive_sent_offer"
                ? "passive sent offer"
                : pair.subClass && pair.subClass !== "OK"
                  ? `failed(${pair.subClass})`
                  : `failed(${pair.voiceClass})`;
    return `${remote}: ${route} / ${detail}`;
  }

  return `${remote}: ${route} / unknown`;
}
