import { debugConsoleLog, debugConsoleInfo } from "@/lib/debugVoiceLog";
import type { RemotePlaybackHealth } from "@/app/call/voice/RemoteAudio";

export type VoiceReconnectDecisionInput = {
  remoteId: string;
  reason: string;
  source: string;
  callerHint?: string;
  force?: boolean;
  conn: string;
  ice: string;
  sig: string;
  hasRemoteStream: boolean;
  tracks: number;
  trackLive: string;
  health: Pick<
    RemotePlaybackHealth,
    | "audioActuallyPlaying"
    | "playbackActive"
    | "playbackActiveMode"
    | "currentTimeAdvanced"
    | "level"
    | "verified"
  > | null;
  confirmedAt: number | null;
  lastPlaySuccessAt: number | null;
  lastPlaybackActiveAt: number | null;
  voiceRoute: string;
  preserveAudioWindowActive: boolean;
  establishedRecovery: boolean;
  hasLiveRemoteStream: boolean;
};

function compactRemoteId(remoteId: string): string {
  const value = String(remoteId ?? "").trim();
  if (!value) return "-";
  if (value.length <= 4) return value;
  return value.slice(-4);
}

function formatAge(ts: number | null | undefined, nowMs: number): string {
  if (ts == null || !Number.isFinite(ts)) return "-";
  return `${Math.max(0, Math.round((nowMs - ts) / 1000))}s`;
}

export function buildVoicePlaybackBlockReason(
  input: VoiceReconnectDecisionInput
): string | null {
  if (input.establishedRecovery) {
    return "p2p_established_recovery";
  }

  if (
    input.health?.audioActuallyPlaying === true &&
    input.hasLiveRemoteStream &&
    input.trackLive === "live"
  ) {
    return "audio_actually_playing";
  }

  if (
    input.health?.playbackActive === true &&
    input.health.playbackActiveMode === "confirmed" &&
    input.hasLiveRemoteStream
  ) {
    return "remote_playback_confirmed";
  }

  if (
    input.confirmedAt != null &&
    input.hasLiveRemoteStream &&
    (input.conn === "connected" || input.ice === "connected" || input.ice === "completed")
  ) {
    return "playback_confirmed_transport_ok";
  }

  return null;
}

export function logVoiceReconnectDecision(
  tag:
    | "voice-reconnect-decision"
    | "voice-reconnect-blocked"
    | "voice-reconnect-fire-check"
    | "voice-hard-reset-decision"
    | "voice-heal-decision",
  input: VoiceReconnectDecisionInput & {
    allow: boolean;
    blockReason?: string;
    action?: string;
  }
) {
  const nowMs = Date.now();
  const remote = compactRemoteId(input.remoteId);

  debugConsoleLog(
    `[${tag}] remote=${remote} allow=${input.allow}` +
      (input.blockReason ? ` block=${input.blockReason}` : "") +
      (input.action ? ` action=${input.action}` : "") +
      ` reason=${input.reason} source=${input.source}` +
      (input.callerHint ? ` caller=${input.callerHint}` : "") +
      ` force=${input.force === true} conn=${input.conn} ice=${input.ice} sig=${input.sig}` +
      ` hasRemoteStream=${input.hasRemoteStream} tracks=${input.tracks} trackLive=${input.trackLive}` +
      ` audioActuallyPlaying=${input.health?.audioActuallyPlaying === true}` +
      ` playbackActive=${input.health?.playbackActive === true}` +
      ` playbackMode=${input.health?.playbackActiveMode ?? "-"}` +
      ` timeAdvanced=${input.health?.currentTimeAdvanced === true}` +
      ` level=${input.health?.level ?? 0}` +
      ` confirmedAt=${formatAge(input.confirmedAt, nowMs)}` +
      ` playSuccessAt=${formatAge(input.lastPlaySuccessAt, nowMs)}` +
      ` playbackActiveAt=${formatAge(input.lastPlaybackActiveAt, nowMs)}` +
      ` route=${input.voiceRoute} preserveWindow=${input.preserveAudioWindowActive}` +
      ` establishedRecovery=${input.establishedRecovery}`
  );
}
