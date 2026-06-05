"use client";

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
  remoteTrackReceived: boolean;
  audioConfirmed: boolean;
  lastSignalAt: number | null;
  lastAudioAt: number | null;
  selectedLocalCandidateType: string | null;
  selectedRemoteCandidateType: string | null;
  voiceClass: VoicePipelineFailureClass;
  updatedAt: number;
};

let localDeviceId = "";
let sessionId = "";
let pairBuilder: (() => VoicePeerPairSnapshot[]) | null = null;
const cachedPairs = new Map<string, VoicePeerPairSnapshot>();

export function resetVoicePeerPairRegistry(nextSessionId: string, nextLocalId: string) {
  const sid = String(nextSessionId ?? "").trim();
  const lid = String(nextLocalId ?? "").trim();
  if (sid === sessionId && lid === localDeviceId) return;
  sessionId = sid;
  localDeviceId = lid;
  cachedPairs.clear();
}

export function registerVoicePeerPairBuilder(
  builder: (() => VoicePeerPairSnapshot[]) | null
) {
  pairBuilder = builder;
}

export function updateVoicePeerPairCache(snapshots: VoicePeerPairSnapshot[]) {
  const now = Date.now();
  for (const snap of snapshots) {
    cachedPairs.set(snap.remoteDeviceId, { ...snap, updatedAt: now });
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
  return Array.from(cachedPairs.values()).sort((a, b) =>
    a.remoteDeviceId.localeCompare(b.remoteDeviceId)
  );
}

export function getVoicePeerPairContext() {
  return { sessionId, localDeviceId };
}
