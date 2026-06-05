"use client";

import { resetVoicePeerPairDiag } from "@/lib/voicePeerPairDiagnostics";
import type { OneWayAudioSubClass } from "@/lib/voiceAudioDiagnostics";
import type { VoicePipelineFailureClass } from "@/lib/voicePerf";

export type VoicePeerPairSnapshot = {
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
  audioProvisional?: boolean;
  lastSignalAt: number | null;
  lastIceAt: number | null;
  lastTrackAt: number | null;
  lastAudioAt: number | null;
  lastAudioConfirmedAt: number | null;
  lastCloseReason: string | null;
  selectedLocalCandidateType: string | null;
  selectedRemoteCandidateType: string | null;
  inboundDeltaBytes: number;
  outboundDeltaBytes: number;
  signalingIssue: string | null;
  voiceClass: VoicePipelineFailureClass;
  subClass: OneWayAudioSubClass | null;
  updatedAt: number;
};

let localDeviceId = "";
let sessionId = "";
let pairBuilder: (() => VoicePeerPairSnapshot[]) | null = null;
const cachedPairs = new Map<string, VoicePeerPairSnapshot>();

export function pairCacheKey(
  remoteDeviceId: string,
  connectionId: string | null | undefined
): string {
  const remote = String(remoteDeviceId ?? "").trim();
  const conn = String(connectionId ?? "").trim() || "none";
  return `${remote}:${conn}`;
}

export function resetVoicePeerPairRegistry(nextSessionId: string, nextLocalId: string) {
  const sid = String(nextSessionId ?? "").trim();
  const lid = String(nextLocalId ?? "").trim();
  if (sid === sessionId && lid === localDeviceId) return;
  sessionId = sid;
  localDeviceId = lid;
  cachedPairs.clear();
  resetVoicePeerPairDiag();
}

export function registerVoicePeerPairBuilder(
  builder: (() => VoicePeerPairSnapshot[]) | null
) {
  pairBuilder = builder;
}

export function purgeVoicePeerPairCacheForRemote(remoteDeviceId: string) {
  const remote = String(remoteDeviceId ?? "").trim();
  for (const key of Array.from(cachedPairs.keys())) {
    if (key.startsWith(`${remote}:`)) {
      cachedPairs.delete(key);
    }
  }
}

export function updateVoicePeerPairCache(snapshots: VoicePeerPairSnapshot[]) {
  const now = Date.now();
  for (const snap of snapshots) {
    const key = pairCacheKey(snap.remoteDeviceId, snap.connectionId);
    cachedPairs.set(key, { ...snap, updatedAt: now });
  }
}

export function dumpVoicePairs(): VoicePeerPairSnapshot[] {
  if (pairBuilder) {
    try {
      return pairBuilder();
    } catch {
      /* fall through */
    }
  }
  const latestByRemote = new Map<string, VoicePeerPairSnapshot>();
  for (const snap of cachedPairs.values()) {
    const prev = latestByRemote.get(snap.remoteDeviceId);
    if (!prev || snap.updatedAt >= prev.updatedAt) {
      latestByRemote.set(snap.remoteDeviceId, snap);
    }
  }
  return Array.from(latestByRemote.values()).sort((a, b) =>
    a.remoteDeviceId.localeCompare(b.remoteDeviceId)
  );
}

export function getVoicePeerPairContext() {
  return { sessionId, localDeviceId };
}
