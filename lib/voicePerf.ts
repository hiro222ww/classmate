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
      (event === "audio_confirmed" || event === "playback_confirmed") &&
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
  "answer_sent",
  "ice_connected",
  "peer_connected",
  "remote_track_received",
  "remote_audio_attached",
  "audio_play_success",
  "audio_confirmed",
] as const;

export function logVoicePerfPipeline(extra?: string) {
  if (!sessionKey || sessionStartedAt <= 0) return;

  const parts = PIPELINE_EVENTS.map((event) => {
    const elapsed = globalMarks.get(event)?.elapsedMs;
    return `${event}=${elapsed ?? "-"}`;
  });

  debugConsoleLog(
    `[voice-perf] pipeline session=${sessionKey.slice(-6)} ${parts.join(" ")}` +
      (extra ? ` extra=${extra}` : "")
  );
}
