"use client";

import { debugConsoleLog } from "@/lib/debugVoiceLog";
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

const CONFIRMED_LEVEL_THRESHOLD = 0.02;
const inboundDeltaByPeer = new Map<string, number>();
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
};

export function setPeerInboundDeltaBytes(remoteId: string, delta: number) {
  inboundDeltaByPeer.set(compactDeviceId(remoteId), Math.max(0, delta));
}

export function setPeerOutboundDeltaBytes(remoteId: string, delta: number) {
  outboundDeltaByPeer.set(compactDeviceId(remoteId), Math.max(0, delta));
}

export function getPeerInboundDeltaBytes(remoteId: string): number {
  return inboundDeltaByPeer.get(compactDeviceId(remoteId)) ?? 0;
}

export function getPeerOutboundDeltaBytes(remoteId: string): number {
  return outboundDeltaByPeer.get(compactDeviceId(remoteId)) ?? 0;
}

export function evaluateAudioConfirmedStrict(input: RemoteAudioConfirmInput): boolean {
  const hasLiveTrack =
    input.audioTracks >= 1 && input.trackReadyState === "live" && !input.trackMuted;

  const hasPlaybackProgress =
    input.currentTimeAdvanced ||
    input.level >= CONFIRMED_LEVEL_THRESHOLD ||
    input.inboundDeltaBytes > 0;

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

export function classifyOneWayAudioSubClass(params: {
  iceConnected: boolean;
  remoteTrackReceived: boolean;
  inboundDeltaBytes: number;
  inboundDeltaPackets: number;
  playSuccess: boolean;
  playFailed: boolean;
  playbackStrict: boolean;
  currentTimeAdvanced: boolean;
  paused: boolean;
  level: number;
  outboundDeltaBytes: number;
  senderTrackReadyState: string;
  senderTrackMuted: boolean;
  senderTrackEnabled: boolean;
}): OneWayAudioSubClass {
  if (!params.iceConnected) return "OK";
  if (params.playbackStrict) return "OK";

  if (!params.remoteTrackReceived) return "D1";

  if (params.playFailed) return "D4";

  if (
    params.inboundDeltaBytes <= 0 &&
    params.inboundDeltaPackets <= 0
  ) {
    if (
      params.outboundDeltaBytes <= 0 ||
      params.senderTrackReadyState === "ended" ||
      (params.senderTrackMuted && !params.senderTrackEnabled)
    ) {
      return "D5";
    }
    return "D2";
  }

  if (params.paused || !params.currentTimeAdvanced) {
    if (!params.playSuccess) return "D4";
    return "D3";
  }

  if (params.level <= 0 && params.inboundDeltaBytes > 0) {
    return "D6";
  }

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
    sampledAt: Date.now(),
  };

  prevRtpStatsByPeer.set(compact, snapshot);
  setPeerInboundDeltaBytes(remoteId, deltaInboundBytes);
  setPeerOutboundDeltaBytes(remoteId, deltaOutboundBytes);

  return snapshot;
}

export function logRemoteAudioConfirmCheck(params: {
  remoteId: string;
  check: RemoteAudioConfirmInput;
  audioConfirmedStrict: boolean;
}) {
  const remote = compactDeviceId(params.remoteId);
  const c = params.check;
  debugConsoleLog(
    `[remote-audio] confirm-check remote=${remote} ` +
      `hasElement=${c.hasElement} srcObjectSet=${c.srcObjectSet} audioTracks=${c.audioTracks} ` +
      `paused=${c.paused} muted=${c.elementMuted} volume=${c.volume.toFixed(2)} ` +
      `currentTime=${c.currentTime.toFixed(2)} currentTimeAdvanced=${c.currentTimeAdvanced} ` +
      `readyState=${c.readyState} networkState=${c.networkState} ` +
      `trackReadyState=${c.trackReadyState} trackMuted=${c.trackMuted} trackEnabled=${c.trackEnabled} ` +
      `level=${c.level.toFixed(3)} inboundDeltaBytes=${c.inboundDeltaBytes} ` +
      `audioConfirmed=${params.audioConfirmedStrict}`
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
}) {
  const remote = compactDeviceId(params.remoteId);
  debugConsoleLog(
    `[local-audio] sender-check remote=${remote} ` +
      `localTrackReadyState=${params.localTrackReadyState} localTrackMuted=${params.localTrackMuted} ` +
      `localTrackEnabled=${params.localTrackEnabled} senderTrackReadyState=${params.senderTrackReadyState} ` +
      `senderTrackEnabled=${params.senderTrackEnabled} senderTrackMuted=${params.senderTrackMuted} ` +
      `bytesSent=${params.bytesSent} packetsSent=${params.packetsSent} ` +
      `deltaBytes=${params.deltaBytesSent} deltaPackets=${params.deltaPacketsSent}`
  );
}

export function logVoiceRtpStats(params: {
  remoteId: string;
  direction: "inbound" | "outbound";
  packets: number;
  bytes: number;
  deltaBytes: number;
  deltaPackets: number;
  audioLevel?: number | null;
}) {
  const remote = compactDeviceId(params.remoteId);
  const levelSuffix =
    params.direction === "inbound" && params.audioLevel != null
      ? ` audioLevel=${params.audioLevel.toFixed(4)}`
      : "";
  debugConsoleLog(
    `[voice-stats] remote=${remote} ${params.direction} packets=${params.packets} bytes=${params.bytes} ` +
      `deltaBytes=${params.deltaBytes} deltaPackets=${params.deltaPackets}${levelSuffix}`
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
  debugConsoleLog(
    `[voice-peer] one-way-audio remote=${compactDeviceId(params.remoteDeviceId)} ` +
      `class=D sub=${params.subClass}(${label}) iceConnected=${params.iceConnected} ` +
      `remoteTrackReceived=${params.remoteTrackReceived} audioConfirmedStrict=${params.audioConfirmedStrict} ` +
      `inboundBytesDelta=${params.inboundDeltaBytes} outboundBytesDelta=${params.outboundDeltaBytes} ` +
      `currentTimeAdvanced=${params.currentTimeAdvanced === true} ` +
      `paused=${params.paused === true} trackLive=${params.trackLive !== false} ` +
      `playFailed=${params.playFailed === true}`
  );
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
    outboundDeltaByPeer.clear();
    prevRtpStatsByPeer.clear();
    return;
  }
  const compact = compactDeviceId(remoteId);
  inboundDeltaByPeer.delete(compact);
  outboundDeltaByPeer.delete(compact);
  prevRtpStatsByPeer.delete(compact);
}
