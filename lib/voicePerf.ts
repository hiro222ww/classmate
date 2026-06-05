"use client";

import { debugConsoleLog, debugConsoleInfo } from "@/lib/debugVoiceLog";
import { compactDeviceId } from "@/app/call/voice/voiceDiagnostics";

type PerfMark = {
  atMs: number;
  elapsedMs: number;
};

let sessionKey = "";
let sessionStartedAt = 0;
const globalMarks = new Map<string, PerfMark>();
const peerMarks = new Map<string, Map<string, PerfMark>>();

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function resetVoicePerfSession(sessionId: string) {
  const nextKey = String(sessionId ?? "").trim();
  if (!nextKey) return;
  if (nextKey === sessionKey && sessionStartedAt > 0) return;
  sessionKey = nextKey;
  sessionStartedAt = nowMs();
  globalMarks.clear();
  peerMarks.clear();
  markVoicePerf("call_session_reset");
}

export function markVoicePerf(
  event: string,
  opts?: { remoteId?: string; extra?: string }
) {
  if (!sessionKey || sessionStartedAt <= 0) return;

  const at = nowMs();
  const elapsedMs = Math.round(at - sessionStartedAt);
  const mark: PerfMark = { atMs: at, elapsedMs };

  if (opts?.remoteId) {
    const remote = compactDeviceId(opts.remoteId);
    const bucket = peerMarks.get(remote) ?? new Map<string, PerfMark>();
    bucket.set(event, mark);
    peerMarks.set(remote, bucket);

    const connectedAt = bucket.get("ice_connected")?.atMs;
    if (
      (event === "audio_confirmed" ||
        event === "audio_confirmed_strict" ||
        event === "playback_confirmed") &&
      connectedAt != null
    ) {
      const delta = Math.round(at - connectedAt);
      debugConsoleLog(
        `[voice-perf] event=${event} remote=${remote} elapsedMs=${elapsedMs} ` +
          `connectedToAudioMs=${delta} extra=${opts.extra ?? "-"}`
      );
      return;
    }

    debugConsoleLog(
      `[voice-perf] event=${event} remote=${remote} elapsedMs=${elapsedMs} ` +
        `extra=${opts.extra ?? "-"}`
    );
    return;
  }

  globalMarks.set(event, mark);
  debugConsoleLog(
    `[voice-perf] event=${event} elapsedMs=${elapsedMs} extra=${opts?.extra ?? "-"}`
  );
}

export function getVoicePerfElapsedMs(): number {
  if (sessionStartedAt <= 0) return 0;
  return Math.round(nowMs() - sessionStartedAt);
}

const PIPELINE_EVENTS = [
  "call_screen_mounted",
  "members_displayed",
  "members_loaded",
  "voice_settings_loaded",
  "local_mic_ready",
  "turn_ice_servers_loaded",
  "peer_connection_created",
  "offer_sent",
  "offer_received",
  "answer_sent",
  "answer_received",
  "ice_sent",
  "ice_received",
  "ice_connected",
  "peer_connected",
  "remote_track_received",
  "remote_audio_attached",
  "audio_play_success",
  "audio_provisional",
  "audio_confirmed",
  "audio_confirmed_strict",
  "peer_closed",
] as const;

export function logVoicePerfPipeline(extra?: string) {
  if (!sessionKey || sessionStartedAt <= 0) return;

  const parts = PIPELINE_EVENTS.map((event) => {
    const elapsed = globalMarks.get(event)?.elapsedMs;
    return `${event}=${elapsed ?? "-"}`;
  });

  const cls = classifyVoicePipelineFailure();

  debugConsoleLog(
    `[voice-perf] pipeline class=${cls} session=${sessionKey.slice(-6)} ${parts.join(" ")}` +
      (extra ? ` extra=${extra}` : "")
  );
}

const PEER_PIPELINE_EVENTS = [
  "peer_connection_created",
  "offer_sent",
  "offer_received",
  "answer_sent",
  "answer_received",
  "ice_sent",
  "ice_received",
  "ice_connected",
  "remote_track_received",
  "audio_provisional",
  "audio_confirmed",
  "audio_confirmed_strict",
  "peer_closed",
] as const;

export type PeerPipelineEvent = (typeof PEER_PIPELINE_EVENTS)[number];

export function getPeerPipelineMarks(
  remoteId: string
): Record<PeerPipelineEvent, boolean> {
  const remote = compactDeviceId(remoteId);
  const bucket = peerMarks.get(remote);
  const out = {} as Record<PeerPipelineEvent, boolean>;
  for (const event of PEER_PIPELINE_EVENTS) {
    out[event] = bucket?.has(event) ?? false;
  }
  return out;
}

/** Summarize per-remote signal/ICE marks for A/B/C/D/E triage (debugVoice=1). */
export function logVoicePeerPipelineSummary(remoteId: string) {
  const remote = compactDeviceId(remoteId);
  const bucket = peerMarks.get(remote);
  const parts = PEER_PIPELINE_EVENTS.map(
    (e) => `${e}=${bucket?.has(e) ? bucket.get(e)?.elapsedMs : "-"}`
  );
  const cls = classifyVoicePipelineFailure(remoteId);
  debugConsoleLog(
    `[voice-perf] peer-pipeline class=${cls} remote=${remote} ${parts.join(" ")}`
  );
  return cls;
}

export type VoicePipelineFailureClass = "A" | "B" | "C" | "D" | "E" | "OK";

function hasAnyPeerMark(event: string): boolean {
  for (const bucket of peerMarks.values()) {
    if (bucket.has(event)) return true;
  }
  return false;
}

function peerHadEarlyClose(remote: string): boolean {
  const bucket = peerMarks.get(remote);
  if (!bucket?.has("peer_closed")) return false;
  const closedAt = bucket.get("peer_closed")?.atMs ?? 0;
  const iceAt = bucket.get("ice_connected")?.atMs ?? 0;
  const audioAt =
    bucket.get("audio_confirmed_strict")?.atMs ??
    bucket.get("audio_confirmed")?.atMs ??
    0;
  if (audioAt > 0) return false;
  if (iceAt > 0 && closedAt > iceAt) return true;
  return closedAt > 0 && iceAt <= 0;
}

export function classifyVoicePipelineFailure(
  remoteId?: string
): VoicePipelineFailureClass {
  if (!globalMarks.has("members_loaded")) return "A";

  const rid = String(remoteId ?? "").trim();
  if (!rid) {
    if (!hasAnyPeerMark("peer_connection_created")) return "A";
    if (!hasAnyPeerMark("offer_sent") && !hasAnyPeerMark("offer_received")) {
      return "B";
    }
    for (const [remote] of peerMarks.entries()) {
      if (peerHadEarlyClose(remote)) return "E";
    }
    return "OK";
  }

  const remote = compactDeviceId(rid);
  const bucket = peerMarks.get(remote);
  const has = (event: string) => bucket?.has(event) ?? false;

  if (peerHadEarlyClose(remote)) return "E";
  if (!has("peer_connection_created")) return "A";
  if (!has("offer_sent") && !has("offer_received")) return "B";
  if (has("offer_received") || has("answer_received") || has("answer_sent")) {
    if (!has("ice_connected")) return "C";
    if (!has("remote_track_received")) return "D";
    if (!has("audio_confirmed_strict")) return "D";
  } else if (has("offer_sent")) {
    return "B";
  }

  return "OK";
}

export function logVoicePipelineClassification(
  remoteId?: string,
  extra?: string
): VoicePipelineFailureClass {
  const cls = classifyVoicePipelineFailure(remoteId);
  debugConsoleLog(
    `[voice-perf] classify class=${cls} remote=${remoteId ? compactDeviceId(remoteId) : "-"} ` +
      `hint=${describeVoicePipelineClass(cls)}` +
      (extra ? ` extra=${extra}` : "")
  );
  return cls;
}

export function describeVoicePipelineClass(
  cls: VoicePipelineFailureClass
): string {
  switch (cls) {
    case "A":
      return "members/remoteIds/is_in_call";
    case "B":
      return "signaling/subscribe/offer/answer";
    case "C":
      return "ICE/TURN/candidates/connectionId";
    case "D":
      return "RemoteAudio/track/play";
    case "E":
      return "cleanup/close/lifecycle";
    default:
      return "ok";
  }
}

export function markVoicePeerClose(
  remoteId: string,
  reason: string,
  extra?: string
) {
  markVoicePerf("peer_closed", { remoteId, extra: `reason=${reason}${extra ? ` ${extra}` : ""}` });
  logVoicePipelineClassification(remoteId, `close reason=${reason}`);
}

export type VoiceConnectionFailureContext = {
  voiceClass: VoicePipelineFailureClass;
  offerSent: boolean;
  answerReceived: boolean;
  iceConnected: boolean;
  audioConfirmed: boolean;
  audioConfirmedStrict: boolean;
  peerCloseReason: string | null;
  remoteIdsSnapshot: string;
};

export function getVoiceConnectionFailureContext(
  remoteId: string,
  opts?: {
    peerCloseReason?: string | null;
    remoteIdsSnapshot?: string[];
  }
): VoiceConnectionFailureContext {
  const remote = compactDeviceId(remoteId);
  const bucket = peerMarks.get(remote);
  const has = (event: string) => bucket?.has(event) ?? false;

  return {
    voiceClass: classifyVoicePipelineFailure(remoteId),
    offerSent: has("offer_sent"),
    answerReceived: has("answer_received"),
    iceConnected: has("ice_connected"),
    audioConfirmed: has("audio_confirmed_strict") || has("audio_confirmed"),
    audioConfirmedStrict: has("audio_confirmed_strict"),
    peerCloseReason: opts?.peerCloseReason ?? null,
    remoteIdsSnapshot: (opts?.remoteIdsSnapshot ?? [])
      .map((id) => compactDeviceId(id))
      .join(",") || "-",
  };
}

export function formatVoiceFailureConnectionState(
  ctx: VoiceConnectionFailureContext
): string {
  return (
    `failed:class=${ctx.voiceClass}|` +
    `offer=${ctx.offerSent ? 1 : 0}|` +
    `answer=${ctx.answerReceived ? 1 : 0}|` +
    `ice=${ctx.iceConnected ? 1 : 0}|` +
    `audio=${ctx.audioConfirmedStrict ? 1 : ctx.audioConfirmed ? 0.5 : 0}|` +
    `close=${ctx.peerCloseReason ?? "-"}|` +
    `remotes=${ctx.remoteIdsSnapshot}`
  );
}
