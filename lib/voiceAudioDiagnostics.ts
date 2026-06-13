"use client";

import {
  debugConsoleLog,
  voiceProdLog,
  voiceProdLogThrottle,
} from "@/lib/debugVoiceLog";
import { compactDeviceId } from "@/app/call/voice/voiceDiagnostics";

export type OneWayAudioSubClass =
  | "D1"
  | "D2"
  | "D3"
  | "D4"
  | "D5"
  | "D6"
  | "OK";

export type OneWayAudioSubClassLabel =
  | "remote_track_missing"
  | "remote_track_silent"
  | "audio_element_not_playing"
  | "autoplay_blocked"
  | "sender_track_dead"
  | "audio_level_zero"
  | "ok";

export const AUDIO_STRICT_CONFIRM_TIMEOUT_MS = 8000;
export const AUDIO_STATS_POLL_INTERVAL_MS = 2000;
export const AUDIO_DIAG_LOG_THROTTLE_MS = 2000;
export const REMOTE_TRACK_RTP_WARMUP_MS = 2500;

export const CONFIRMED_LEVEL_THRESHOLD = 0.02;
const inboundDeltaByPeer = new Map<string, number>();
const inboundDeltaPacketsByPeer = new Map<string, number>();
const outboundDeltaByPeer = new Map<string, number>();

export type PeerRtpStatsSnapshot = {
  inboundPackets: number;
  inboundBytes: number;
  outboundPackets: number;
  outboundBytes: number;
  inboundAudioLevel: number | null;
  inboundTotalAudioEnergy: number | null;
  inboundTotalSamplesDuration: number | null;
  deltaInboundBytes: number;
  deltaOutboundBytes: number;
  deltaInboundPackets: number;
  deltaOutboundPackets: number;
  hadRtpBaseline: boolean;
  sampledAt: number;
};

const prevRtpStatsByPeer = new Map<string, PeerRtpStatsSnapshot>();

export type RemoteAudioConfirmInput = {
  hasElement: boolean;
  srcObjectSet: boolean;
  audioTracks: number;
  paused: boolean;
  elementMuted: boolean;
  volume: number;
  currentTime: number;
  currentTimeAdvanced: boolean;
  readyState: number;
  networkState: number;
  trackReadyState: string;
  trackMuted: boolean;
  trackEnabled: boolean;
  level: number;
  playSuccess: boolean;
  playFailed: boolean;
  inboundDeltaBytes: number;
  inboundDeltaPackets: number;
  /** True when playback is active with RTP/level evidence (not time-advance alone). */
  playbackActive?: boolean;
};

export function setPeerInboundDeltaBytes(remoteId: string, delta: number) {
  inboundDeltaByPeer.set(compactDeviceId(remoteId), Math.max(0, delta));
}

export function setPeerInboundDeltaPackets(remoteId: string, delta: number) {
  inboundDeltaPacketsByPeer.set(compactDeviceId(remoteId), Math.max(0, delta));
}

export function setPeerOutboundDeltaBytes(remoteId: string, delta: number) {
  outboundDeltaByPeer.set(compactDeviceId(remoteId), Math.max(0, delta));
}

export function getPeerInboundDeltaBytes(remoteId: string): number {
  return inboundDeltaByPeer.get(compactDeviceId(remoteId)) ?? 0;
}

export function getPeerInboundDeltaPackets(remoteId: string): number {
  return inboundDeltaPacketsByPeer.get(compactDeviceId(remoteId)) ?? 0;
}

export function getPeerOutboundDeltaBytes(remoteId: string): number {
  return outboundDeltaByPeer.get(compactDeviceId(remoteId)) ?? 0;
}

export function hasStrongInboundPlaybackEvidence(params: {
  level?: number;
  inboundDeltaBytes?: number;
  inboundDeltaPackets?: number;
}): boolean {
  return (
    (params.level ?? 0) >= CONFIRMED_LEVEL_THRESHOLD ||
    (params.inboundDeltaBytes ?? 0) > 0 ||
    (params.inboundDeltaPackets ?? 0) > 0
  );
}

export function hasRemotePlaybackStartedEvidence(params: {
  playSuccess?: boolean;
  recentPlaySuccess?: boolean;
  trackMuted?: boolean;
  trackLive?: boolean;
  inboundDeltaBytes?: number;
  inboundDeltaPackets?: number;
}): boolean {
  if (!params.playSuccess && !params.recentPlaySuccess) return false;
  if (params.trackLive === false) return false;

  if (params.trackMuted === true) {
    const inboundActive =
      (params.inboundDeltaBytes ?? 0) > 0 ||
      (params.inboundDeltaPackets ?? 0) > 0;
    if (!inboundActive) return false;
  }

  return true;
}

export function evaluateAudioConfirmedStrict(
  input: RemoteAudioConfirmInput,
  opts?: { alreadyConfirmed?: boolean }
): boolean {
  const hasLiveTrack =
    input.audioTracks >= 1 && input.trackReadyState === "live" && !input.trackMuted;

  const hasStrongPlaybackEvidence = hasStrongInboundPlaybackEvidence({
    level: input.level,
    inboundDeltaBytes: input.inboundDeltaBytes,
    inboundDeltaPackets: input.inboundDeltaPackets,
  });

  const hasPlaybackProgress = opts?.alreadyConfirmed
    ? input.currentTimeAdvanced || hasStrongPlaybackEvidence
    : hasStrongPlaybackEvidence;

  return (
    input.hasElement &&
    input.srcObjectSet &&
    hasLiveTrack &&
    input.playSuccess &&
    !input.paused &&
    !input.elementMuted &&
    input.trackEnabled !== false &&
    hasPlaybackProgress
  );
}

export function describeOneWayAudioSubClass(
  sub: OneWayAudioSubClass
): OneWayAudioSubClassLabel {
  switch (sub) {
    case "D1":
      return "remote_track_missing";
    case "D2":
      return "remote_track_silent";
    case "D3":
      return "audio_element_not_playing";
    case "D4":
      return "autoplay_blocked";
    case "D5":
      return "sender_track_dead";
    case "D6":
      return "audio_level_zero";
    default:
      return "ok";
  }
}

export function hasPeerRtpStatsBaseline(remoteId: string): boolean {
  return prevRtpStatsByPeer.has(compactDeviceId(remoteId));
}

export function classifyOneWayAudioFromConfirmInput(
  remoteId: string,
  input: RemoteAudioConfirmInput,
  opts?: {
    iceConnected?: boolean;
    playbackStrict?: boolean;
    outboundDeltaBytes?: number;
    senderTrackReadyState?: string;
    senderTrackMuted?: boolean;
    senderTrackEnabled?: boolean;
    localSenderExpected?: boolean;
    userIntentionallyMuted?: boolean;
    remoteTrackReceivedAtMs?: number | null;
    elementPaused?: boolean;
    nowMs?: number;
  }
): OneWayAudioSubClass {
  const remoteTrackReceived =
    input.audioTracks >= 1 &&
    input.trackReadyState === "live" &&
    !input.trackMuted;

  return classifyOneWayAudioSubClass({
    iceConnected: opts?.iceConnected !== false,
    remoteTrackReceived,
    inboundDeltaBytes: input.inboundDeltaBytes,
    inboundDeltaPackets: input.inboundDeltaPackets,
    inboundBytesTotal: input.inboundDeltaBytes,
    hasRtpBaseline: hasPeerRtpStatsBaseline(remoteId),
    playSuccess: input.playSuccess,
    playFailed: input.playFailed,
    playbackStrict: opts?.playbackStrict === true,
    currentTimeAdvanced: input.currentTimeAdvanced,
    playbackUnconfirmed:
      input.playSuccess && opts?.playbackStrict !== true,
    level: input.level,
    outboundDeltaBytes:
      opts?.outboundDeltaBytes ?? getPeerOutboundDeltaBytes(remoteId),
    senderTrackReadyState: opts?.senderTrackReadyState ?? "none",
    senderTrackMuted: opts?.senderTrackMuted ?? false,
    senderTrackEnabled: opts?.senderTrackEnabled ?? false,
    localSenderExpected: opts?.localSenderExpected,
    userIntentionallyMuted: opts?.userIntentionallyMuted,
    remoteTrackReceivedAtMs: opts?.remoteTrackReceivedAtMs,
    elementPaused: opts?.elementPaused,
    nowMs: opts?.nowMs,
  });
}

export function classifyOneWayAudioSubClass(params: {
  iceConnected: boolean;
  remoteTrackReceived: boolean;
  inboundDeltaBytes: number;
  inboundDeltaPackets: number;
  inboundBytesTotal?: number;
  hasRtpBaseline?: boolean;
  playSuccess: boolean;
  playFailed: boolean;
  playbackStrict: boolean;
  currentTimeAdvanced: boolean;
  /** @deprecated use playbackUnconfirmed */
  paused?: boolean;
  playbackUnconfirmed?: boolean;
  level: number;
  outboundDeltaBytes: number;
  senderTrackReadyState: string;
  senderTrackMuted: boolean;
  senderTrackEnabled: boolean;
  localSenderExpected?: boolean;
  userIntentionallyMuted?: boolean;
  remoteTrackReceivedAtMs?: number | null;
  elementPaused?: boolean;
  nowMs?: number;
}): OneWayAudioSubClass {
  if (!params.iceConnected) return "OK";
  if (params.playbackStrict) return "OK";

  if (!params.remoteTrackReceived) return "D1";

  if (params.playFailed) return "D4";

  const inboundActive =
    params.inboundDeltaBytes > 0 ||
    params.inboundDeltaPackets > 0 ||
    (params.hasRtpBaseline === false &&
      (params.inboundBytesTotal ?? 0) > 0);

  if (!inboundActive) {
    const nowMs = params.nowMs ?? Date.now();
    const receivedAt = params.remoteTrackReceivedAtMs;
    if (
      receivedAt != null &&
      nowMs - receivedAt < REMOTE_TRACK_RTP_WARMUP_MS &&
      params.playSuccess
    ) {
      return "OK";
    }

    if (params.userIntentionallyMuted) {
      return "OK";
    }

    const senderShouldBeLive = params.localSenderExpected !== false;
    if (
      senderShouldBeLive &&
      (params.outboundDeltaBytes <= 0 ||
        params.senderTrackReadyState === "ended" ||
        (params.senderTrackMuted && !params.senderTrackEnabled))
    ) {
      return "D5";
    }
    return "D2";
  }

  if (
    params.playSuccess &&
    hasStrongInboundPlaybackEvidence({
      level: params.level,
      inboundDeltaBytes: params.inboundDeltaBytes,
      inboundDeltaPackets: params.inboundDeltaPackets,
    })
  ) {
    return "OK";
  }

  if (params.level <= 0 && inboundActive) {
    if (
      params.playSuccess &&
      hasStrongInboundPlaybackEvidence({
        level: params.level,
        inboundDeltaBytes: params.inboundDeltaBytes,
        inboundDeltaPackets: params.inboundDeltaPackets,
      })
    ) {
      return "OK";
    }
    return "D6";
  }

  if (params.elementPaused === true) {
    if (!params.playSuccess) return "D4";
    return "D3";
  }

  if (!params.playSuccess) return "D4";

  return "OK";
}

export async function collectPeerRtpStats(
  pc: RTCPeerConnection,
  remoteId: string
): Promise<PeerRtpStatsSnapshot> {
  const compact = compactDeviceId(remoteId);
  const prev = prevRtpStatsByPeer.get(compact);
  let inboundPackets = 0;
  let inboundBytes = 0;
  let outboundPackets = 0;
  let outboundBytes = 0;
  let inboundAudioLevel: number | null = null;
  let inboundTotalAudioEnergy: number | null = null;
  let inboundTotalSamplesDuration: number | null = null;

  try {
    const stats = await pc.getStats();
    stats.forEach((report) => {
      if (report.type === "inbound-rtp" && report.kind === "audio") {
        inboundPackets += Number(report.packetsReceived ?? 0);
        inboundBytes += Number(report.bytesReceived ?? 0);
        if (typeof report.audioLevel === "number") {
          inboundAudioLevel = report.audioLevel;
        }
        if (typeof report.totalAudioEnergy === "number") {
          inboundTotalAudioEnergy = report.totalAudioEnergy;
        }
        if (typeof report.totalSamplesDuration === "number") {
          inboundTotalSamplesDuration = report.totalSamplesDuration;
        }
      }
      if (report.type === "outbound-rtp" && report.kind === "audio") {
        outboundPackets += Number(report.packetsSent ?? 0);
        outboundBytes += Number(report.bytesSent ?? 0);
      }
    });
  } catch {
    // getStats may fail while pc is closing
  }

  const deltaInboundBytes = prev
    ? Math.max(0, inboundBytes - prev.inboundBytes)
    : 0;
  const deltaOutboundBytes = prev
    ? Math.max(0, outboundBytes - prev.outboundBytes)
    : 0;
  const deltaInboundPackets = prev
    ? Math.max(0, inboundPackets - prev.inboundPackets)
    : 0;
  const deltaOutboundPackets = prev
    ? Math.max(0, outboundPackets - prev.outboundPackets)
    : 0;

  const snapshot: PeerRtpStatsSnapshot = {
    inboundPackets,
    inboundBytes,
    outboundPackets,
    outboundBytes,
    inboundAudioLevel,
    inboundTotalAudioEnergy,
    inboundTotalSamplesDuration,
    deltaInboundBytes,
    deltaOutboundBytes,
    deltaInboundPackets,
    deltaOutboundPackets,
    hadRtpBaseline: prev != null,
    sampledAt: Date.now(),
  };

  prevRtpStatsByPeer.set(compact, snapshot);
  setPeerInboundDeltaBytes(remoteId, deltaInboundBytes);
  setPeerInboundDeltaPackets(remoteId, deltaInboundPackets);
  setPeerOutboundDeltaBytes(remoteId, deltaOutboundBytes);

  return snapshot;
}

export function logRemoteAudioConfirmCheck(params: {
  remoteId: string;
  check: RemoteAudioConfirmInput;
  audioConfirmedStrict: boolean;
  outboundDeltaBytes?: number;
  senderTrackReadyState?: string;
  senderTrackMuted?: boolean;
  senderTrackEnabled?: boolean;
  localSenderExpected?: boolean;
  userIntentionallyMuted?: boolean;
}) {
  const remote = compactDeviceId(params.remoteId);
  const c = params.check;
  const subClass = params.audioConfirmedStrict
    ? "OK"
    : classifyOneWayAudioFromConfirmInput(params.remoteId, c, {
        playbackStrict: params.audioConfirmedStrict,
        outboundDeltaBytes: params.outboundDeltaBytes,
        senderTrackReadyState: params.senderTrackReadyState,
        senderTrackMuted: params.senderTrackMuted,
        senderTrackEnabled: params.senderTrackEnabled,
        localSenderExpected: params.localSenderExpected,
        userIntentionallyMuted: params.userIntentionallyMuted,
      });
  const subSuffix =
    subClass !== "OK" ? ` sub=${subClass}(${describeOneWayAudioSubClass(subClass)})` : "";
  if (params.audioConfirmedStrict) {
    voiceProdLog(
      `[remote-audio] audio_confirmed_strict remote=${remote} ` +
        `currentTime=${c.currentTime.toFixed(2)} level=${c.level.toFixed(3)} ` +
        `advanced=${c.currentTimeAdvanced} inboundDeltaBytes=${c.inboundDeltaBytes} ` +
        `inboundDeltaPkts=${c.inboundDeltaPackets}`
    );
  }
  debugConsoleLog(
    `[remote-audio] confirm-check remote=${remote} ` +
      `hasElement=${c.hasElement} srcObjectSet=${c.srcObjectSet} audioTracks=${c.audioTracks} ` +
      `paused=${c.paused} muted=${c.elementMuted} volume=${c.volume.toFixed(2)} ` +
      `currentTime=${c.currentTime.toFixed(2)} currentTimeAdvanced=${c.currentTimeAdvanced} ` +
      `readyState=${c.readyState} networkState=${c.networkState} ` +
      `trackReadyState=${c.trackReadyState} trackMuted=${c.trackMuted} trackEnabled=${c.trackEnabled} ` +
      `level=${c.level.toFixed(3)} inboundDeltaBytes=${c.inboundDeltaBytes} ` +
      `inboundDeltaPkts=${c.inboundDeltaPackets} ` +
      `audioConfirmed=${params.audioConfirmedStrict}${subSuffix}`
  );
}

export function logLocalAudioSenderCheck(params: {
  remoteId: string;
  localTrackReadyState: string;
  localTrackMuted: boolean;
  localTrackEnabled: boolean;
  senderTrackReadyState: string;
  senderTrackEnabled: boolean;
  senderTrackMuted: boolean;
  bytesSent: number;
  packetsSent: number;
  deltaBytesSent: number;
  deltaPacketsSent: number;
  subClass?: OneWayAudioSubClass | null;
}) {
  const remote = compactDeviceId(params.remoteId);
  const subSuffix =
    params.subClass && params.subClass !== "OK"
      ? ` sub=${params.subClass}(${describeOneWayAudioSubClass(params.subClass)})`
      : "";
  debugConsoleLog(
    `[local-audio] sender-check remote=${remote} ` +
      `localTrackReadyState=${params.localTrackReadyState} localTrackMuted=${params.localTrackMuted} ` +
      `localTrackEnabled=${params.localTrackEnabled} senderTrackReadyState=${params.senderTrackReadyState} ` +
      `senderTrackEnabled=${params.senderTrackEnabled} senderTrackMuted=${params.senderTrackMuted} ` +
      `bytesSent=${params.bytesSent} packetsSent=${params.packetsSent} ` +
      `deltaBytes=${params.deltaBytesSent} deltaPackets=${params.deltaPacketsSent}${subSuffix}`
  );
}

export function logVoiceRtpDiagnosticsProd(params: {
  remoteId: string;
  stats: PeerRtpStatsSnapshot;
  subClass?: OneWayAudioSubClass | null;
  localTrackReadyState: string;
  localTrackMuted: boolean;
  localTrackEnabled: boolean;
  senderTrackReadyState: string;
  senderTrackEnabled: boolean;
  senderTrackMuted: boolean;
  remoteTrackMuted?: boolean;
  remoteTrackEnabled?: boolean;
  remoteTrackReadyState?: string;
  force?: boolean;
  userIntentionallyMuted?: boolean;
}) {
  const remote = compactDeviceId(params.remoteId);
  const sub =
    params.subClass && params.subClass !== "OK" ? params.subClass : null;
  const subSuffix = sub
    ? ` sub=${sub}(${describeOneWayAudioSubClass(sub)})`
    : "";
  const mutedSuffix =
    params.userIntentionallyMuted === true ? " userMutedExpected=1" : "";
  const line =
    `[voice-stats] remote=${remote} ` +
    `inbound bytes=${params.stats.inboundBytes} delta=${params.stats.deltaInboundBytes} ` +
    `pkts=${params.stats.inboundPackets} deltaPkts=${params.stats.deltaInboundPackets} ` +
    `outbound bytes=${params.stats.outboundBytes} delta=${params.stats.deltaOutboundBytes} ` +
    `pkts=${params.stats.outboundPackets} deltaPkts=${params.stats.deltaOutboundPackets}` +
    ` remoteTrack muted=${params.remoteTrackMuted === true ? 1 : params.remoteTrackMuted === false ? 0 : "-"} ` +
    `enabled=${params.remoteTrackEnabled === true ? 1 : params.remoteTrackEnabled === false ? 0 : "-"} ` +
    `ready=${params.remoteTrackReadyState ?? "-"} ` +
    `localTrack ready=${params.localTrackReadyState} muted=${params.localTrackMuted ? 1 : 0} ` +
    `enabled=${params.localTrackEnabled ? 1 : 0} ` +
    `sender ready=${params.senderTrackReadyState} muted=${params.senderTrackMuted ? 1 : 0} ` +
    `enabled=${params.senderTrackEnabled ? 1 : 0}${mutedSuffix}${subSuffix}`;

  if (sub || params.force) {
    voiceProdLog(line);
  } else {
    voiceProdLogThrottle(`voice-stats:${remote}`, 3000, line);
  }
}

export function logVoiceRtpStats(params: {
  remoteId: string;
  direction: "inbound" | "outbound";
  packets: number;
  bytes: number;
  deltaBytes: number;
  deltaPackets: number;
  audioLevel?: number | null;
  subClass?: OneWayAudioSubClass | null;
}) {
  const remote = compactDeviceId(params.remoteId);
  const levelSuffix =
    params.direction === "inbound" && params.audioLevel != null
      ? ` audioLevel=${params.audioLevel.toFixed(4)}`
      : "";
  const subSuffix =
    params.direction === "inbound" &&
    params.subClass &&
    params.subClass !== "OK"
      ? ` sub=${params.subClass}(${describeOneWayAudioSubClass(params.subClass)})`
      : "";
  debugConsoleLog(
    `[voice-stats] remote=${remote} ${params.direction} packets=${params.packets} bytes=${params.bytes} ` +
      `deltaBytes=${params.deltaBytes} deltaPackets=${params.deltaPackets}${levelSuffix}${subSuffix}`
  );
}

export function logVoiceOneWayAudioSubClass(params: {
  remoteDeviceId: string;
  subClass: OneWayAudioSubClass;
  iceConnected: boolean;
  remoteTrackReceived: boolean;
  audioConfirmedStrict: boolean;
  inboundDeltaBytes: number;
  outboundDeltaBytes: number;
  currentTimeAdvanced?: boolean;
  paused?: boolean;
  trackLive?: boolean;
  playFailed?: boolean;
}) {
  const label = describeOneWayAudioSubClass(params.subClass);
  const remote = compactDeviceId(params.remoteDeviceId);
  const line =
    `[voice-peer] one-way-audio remote=${remote} ` +
    `class=D sub=${params.subClass}(${label}) iceConnected=${params.iceConnected} ` +
    `remoteTrackReceived=${params.remoteTrackReceived} audioConfirmedStrict=${params.audioConfirmedStrict} ` +
    `inboundBytesDelta=${params.inboundDeltaBytes} outboundBytesDelta=${params.outboundDeltaBytes} ` +
    `currentTimeAdvanced=${params.currentTimeAdvanced === true} ` +
    `paused=${params.paused === true} trackLive=${params.trackLive !== false} ` +
    `playFailed=${params.playFailed === true}`;
  voiceProdLog(line);
  debugConsoleLog(line);
}

export type VoiceConnectedAudioState = {
  route: string;
  iceOk: boolean;
  trackOk: boolean;
  playback: "strict" | "provisional" | "pending" | "failed";
  audio: "strict" | "provisional" | "pending" | "failed";
  subClass: OneWayAudioSubClass | null;
  oneWay: boolean;
};

export function formatVoiceConnectedConnectionState(
  state: VoiceConnectedAudioState
): string {
  const sub = state.subClass && state.subClass !== "OK" ? state.subClass : "-";
  return (
    `connected:route=${state.route}|ice=${state.iceOk ? 1 : 0}|track=${state.trackOk ? 1 : 0}|` +
    `playback=${state.playback}|audio=${state.audio}|sub=${sub}|oneWay=${state.oneWay ? 1 : 0}`
  );
}

export function parseVoiceConnectedState(state: string | null | undefined): {
  route: string | null;
  ice: string | null;
  track: string | null;
  playback: string | null;
  audio: string | null;
  sub: string | null;
  oneWay: string | null;
} {
  const raw = String(state ?? "").trim();
  if (!raw.startsWith("connected:")) {
    return {
      route: null,
      ice: null,
      track: null,
      playback: null,
      audio: null,
      sub: null,
      oneWay: null,
    };
  }
  const parts = raw.split("|");
  const read = (key: string) => {
    const part = parts.find((p) => p.startsWith(`${key}=`));
    return part ? part.slice(key.length + 1) : null;
  };
  return {
    route: read("route"),
    ice: read("ice"),
    track: read("track"),
    playback: read("playback"),
    audio: read("audio"),
    sub: read("sub"),
    oneWay: read("oneWay"),
  };
}

export function formatConnectedPairStatusLabel(
  state: string | null | undefined,
  phase?: string | null
): string {
  const connected = parseVoiceConnectedState(state);
  if (connected.route != null) {
    const route =
      connected.route === "turn" || connected.route === "relay"
        ? "TURN"
        : connected.route === "p2p"
          ? "P2P"
          : connected.route;
    const ice = connected.ice === "1" ? "ICE OK" : "ICE pending";
    const track =
      connected.track === "1" ? "track OK" : connected.track === "0" ? "track NG" : "track pending";
    const playback =
      connected.playback === "strict"
        ? "playback OK"
        : connected.playback === "provisional"
          ? "playback provisional"
          : connected.playback === "failed"
            ? "playback NG"
            : "playback pending";
    const audio =
      connected.audio === "strict"
        ? "audio OK"
        : connected.audio === "provisional"
          ? "audio provisional"
          : connected.audio === "failed"
            ? connected.sub && connected.sub !== "-"
              ? `audio failed(${connected.sub})`
              : "audio failed"
            : "audio pending";
    if (connected.oneWay === "1") {
      return `${route} / ${ice} / one-way audio / ${playback} / ${audio}`;
    }
    return `${route} / ${ice} / ${track} / ${playback} / ${audio}`;
  }

  if (state === "connected" || phase === "connected") {
    return "ICE OK / audio pending";
  }

  return state || "unknown";
}

export function resetPeerAudioDiagnostics(remoteId?: string) {
  if (!remoteId) {
    inboundDeltaByPeer.clear();
    inboundDeltaPacketsByPeer.clear();
    outboundDeltaByPeer.clear();
    prevRtpStatsByPeer.clear();
    return;
  }
  const compact = compactDeviceId(remoteId);
  inboundDeltaByPeer.delete(compact);
  inboundDeltaPacketsByPeer.delete(compact);
  outboundDeltaByPeer.delete(compact);
  prevRtpStatsByPeer.delete(compact);
}
