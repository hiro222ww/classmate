"use client";

import { debugConsoleLog, debugConsoleInfo } from "@/lib/debugVoiceLog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatVoiceModeSuffix,
  getVoiceModePolicy,
} from "@/lib/voiceClientEnv";
import {
  registerRemoteAudioPlayAll,
  requestRemoteAudioUnlock,
  resumeSharedAudioContext,
  subscribeRemoteAudioUnlock,
} from "@/lib/remoteAudioUnlock";
import {
  logRemoteAudioPipeline,
  logVoicePeerAutoRecover,
} from "./voiceDiagnostics";
import { markVoicePerf } from "@/lib/voicePerf";
import {
  evaluateAudioConfirmedStrict,
  getPeerInboundDeltaBytes,
  logRemoteAudioConfirmCheck,
  type RemoteAudioConfirmInput,
} from "@/lib/voiceAudioDiagnostics";

const voicePolicy = getVoiceModePolicy();
const ATTACH_LOG_THROTTLE_MS = 5000;
const PROVISIONAL_PLAYBACK_MS = 15000;
const SILENT_PLAYBACK_SUSPECT_MS = 8000;
const CONFIRMED_LEVEL_THRESHOLD = 0.02;
const REATTACH_DELAY_MS = 100;
const AUDIO_OUTPUT_CONFIG_LOG_THROTTLE_MS = 10000;
const PLAYBACK_CHECK_INTERVAL_MS = 2000;
const MAX_SILENT_REATTACH_ATTEMPTS = 3;

export type PlaybackActiveMode = "confirmed" | "provisional" | "none";

export type RemotePlaybackHealth = {
  playSuccess: boolean;
  playSuccessEvent?: boolean;
  playbackActive: boolean;
  playbackActiveMode: PlaybackActiveMode;
  currentTimeAdvanced: boolean;
  trackMuted: boolean;
  trackReady: string;
  level: number;
  webAudioFallback: boolean;
  verified: boolean;
  lastPlaySuccessAt: number | null;
  playFailedAt: number | null;
  lastAttachAt: number | null;
  audioActuallyPlaying: boolean;
  audioConfirmedStrict: boolean;
};

const PLAYBACK_HEALTH_LOG_THROTTLE_MS = 2000;

function callWarn(...args: unknown[]) {
  console.warn(...args);
}

function compactRemoteId(remoteId: string): string {
  const value = String(remoteId ?? "").trim();
  if (!value) return "-";
  if (value.length <= 4) return value;
  return value.slice(-3);
}

function compactMediaId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 6) return value;
  return value.slice(-6);
}

function createRemoteAudioInstanceId(): string {
  return Math.random().toString(36).slice(2, 6);
}

function getPlaybackTrack(
  el: HTMLAudioElement | null,
  stream: MediaStream | null | undefined
): MediaStreamTrack | null {
  const srcObject = el?.srcObject;
  if (srcObject instanceof MediaStream) {
    return srcObject.getAudioTracks()[0] ?? null;
  }
  return stream?.getAudioTracks?.()[0] ?? null;
}

function isPlaybackTrackEnded(
  el: HTMLAudioElement | null,
  stream: MediaStream | null | undefined
): boolean {
  const track = getPlaybackTrack(el, stream);
  return !track || track.readyState === "ended";
}

function getSinkId(el: HTMLAudioElement): string {
  return String(
    (el as HTMLMediaElement & { sinkId?: string }).sinkId ?? "-"
  );
}

function getSafariAudioDebug(el: HTMLAudioElement): Record<string, string | number> {
  const extra: Record<string, string | number> = {
    visibilityState:
      typeof document !== "undefined" ? document.visibilityState : "-",
  };

  const webkitEl = el as HTMLAudioElement & {
    webkitAudioDecodedByteCount?: number;
  };
  if (typeof webkitEl.webkitAudioDecodedByteCount === "number") {
    extra.webkitAudioDecodedByteCount = webkitEl.webkitAudioDecodedByteCount;
  }

  const mediaEl = el as HTMLMediaElement & {
    audioTracks?: Array<{ enabled?: boolean }>;
  };
  if (mediaEl.audioTracks?.length) {
    extra.mediaElementAudioTracks = mediaEl.audioTracks.length;
    extra.mediaElementAudioTrack0Enabled = String(
      mediaEl.audioTracks[0]?.enabled ?? "-"
    );
  }

  return extra;
}

function logPlaybackCheck(params: {
  remoteId: string;
  instanceId: string;
  el: HTMLAudioElement;
  stream: MediaStream;
  afterMs: number;
  previousCurrentTime: number;
  level: number;
  health: RemotePlaybackHealth;
}) {
  const { remoteId, instanceId, el, stream, afterMs, previousCurrentTime, level, health } =
    params;
  const track = getPlaybackTrack(el, stream);
  const safari = getSafariAudioDebug(el);

  const confirmed =
    health.playbackActiveMode === "confirmed" || health.currentTimeAdvanced;

  debugConsoleLog(
    `[remote-audio] playback-check remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
      `afterMs=${afterMs} currentTime=${el.currentTime.toFixed(2)} previousCurrentTime=${previousCurrentTime.toFixed(2)} ` +
      `advanced=${health.currentTimeAdvanced} level=${level.toFixed(3)} paused=${el.paused} muted=${el.muted} volume=${el.volume} ` +
      `readyState=${el.readyState} networkState=${el.networkState} trackReady=${track?.readyState ?? "-"} ` +
      `trackMuted=${track?.muted ?? "-"} srcObjectSet=${el.srcObject === stream} audioTracks=${stream.getAudioTracks().length} ` +
      `playbackActive=${health.playbackActive} playbackMode=${health.playbackActiveMode} confirmed=${confirmed} ` +
      `visibility=${safari.visibilityState} decodedBytes=${safari.webkitAudioDecodedByteCount ?? "-"} ${formatVoiceModeSuffix()}`
  );
}

function logRemoteAudioCompact(
  remoteId: string,
  el: HTMLAudioElement,
  stream: MediaStream,
  tag: string,
  extra?: Record<string, string | number | boolean>
) {
  const track = stream.getAudioTracks()[0];
  const parts = [
    `[remote-audio] ${tag}`,
    `remote=${compactRemoteId(remoteId)}`,
    `paused=${el.paused}`,
    `muted=${el.muted}`,
    `volume=${el.volume}`,
    `currentTime=${el.currentTime.toFixed(2)}`,
    `readyState=${el.readyState}`,
    `networkState=${el.networkState}`,
    `sinkId=${getSinkId(el)}`,
    `trackMuted=${track?.muted ?? "-"}`,
    `trackReady=${track?.readyState ?? "-"}`,
    `srcObjectSet=${el.srcObject === stream}`,
    `audioTracks=${stream.getAudioTracks().length}`,
    formatVoiceModeSuffix(),
  ];

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      parts.push(`${key}=${value}`);
    }
  }

  debugConsoleLog(parts.join(" "));
}

function evaluateRemotePlaybackHealth(params: {
  el: HTMLAudioElement;
  stream: MediaStream;
  playSuccess: boolean;
  playSuccessEvent?: boolean;
  currentTime: number;
  previousCurrentTime?: number;
  level: number;
  webAudioFallback: boolean;
  provisionalStartedAt: number | null;
  lastPlaySuccessAt: number | null;
  playFailedAt: number | null;
  lastAttachAt: number | null;
  afterMs?: number;
  nowMs?: number;
}): RemotePlaybackHealth {
  const {
    el,
    stream,
    playSuccess,
    playSuccessEvent = false,
    currentTime,
    previousCurrentTime,
    level,
    webAudioFallback,
    provisionalStartedAt,
    lastPlaySuccessAt,
    playFailedAt,
    lastAttachAt,
    afterMs = 0,
    nowMs = Date.now(),
  } = params;

  const track = getPlaybackTrack(el, stream);
  const trackReady = track?.readyState ?? "-";
  const trackMuted = track?.muted ?? false;
  const elPaused = el.paused;
  const readyState = el.readyState;
  const srcObjectSet = el.srcObject === stream;
  const audioTracks = stream.getAudioTracks().length;

  const currentTimeAdvanced =
    previousCurrentTime != null && currentTime > previousCurrentTime + 0.01;

  const confirmedActive =
    playSuccess &&
    trackReady === "live" &&
    !elPaused &&
    !trackMuted &&
    (currentTimeAdvanced || level > CONFIRMED_LEVEL_THRESHOLD);

  const provisionalEligible =
    playSuccess &&
    trackReady === "live" &&
    !elPaused &&
    readyState >= 2 &&
    srcObjectSet &&
    audioTracks >= 1;

  const provisionalActive =
    provisionalEligible &&
    provisionalStartedAt != null &&
    nowMs - provisionalStartedAt < PROVISIONAL_PLAYBACK_MS;

  const playbackActive = confirmedActive;
  const playbackActiveMode: PlaybackActiveMode = confirmedActive
    ? "confirmed"
    : provisionalActive
      ? "provisional"
      : "none";

  const verified =
    playSuccess &&
    !trackMuted &&
    trackReady === "live" &&
    !elPaused &&
    (currentTimeAdvanced ||
      level > 0.02 ||
      webAudioFallback ||
      (voicePolicy.voiceMode !== "ios_conservative" && afterMs >= 1500));

  const audioActuallyPlaying = confirmedActive;

  return {
    playSuccess,
    playSuccessEvent,
    playbackActive,
    playbackActiveMode,
    currentTimeAdvanced,
    trackMuted,
    trackReady,
    level,
    webAudioFallback,
    verified,
    lastPlaySuccessAt,
    playFailedAt,
    lastAttachAt,
    audioActuallyPlaying,
    audioConfirmedStrict: false,
  };
}

function buildRemoteAudioConfirmInput(params: {
  el: HTMLAudioElement;
  stream: MediaStream;
  health: Pick<
    RemotePlaybackHealth,
    "playSuccess" | "currentTimeAdvanced" | "trackMuted" | "trackReady" | "level"
  >;
  remoteId: string;
  playFailed: boolean;
}): RemoteAudioConfirmInput {
  const { el, stream, health, remoteId, playFailed } = params;
  const track = getPlaybackTrack(el, stream);
  return {
    hasElement: true,
    srcObjectSet: el.srcObject === stream,
    audioTracks: stream.getAudioTracks().length,
    paused: el.paused,
    elementMuted: el.muted,
    volume: el.volume,
    currentTime: el.currentTime,
    currentTimeAdvanced: health.currentTimeAdvanced,
    readyState: el.readyState,
    networkState: el.networkState,
    trackReadyState: health.trackReady,
    trackMuted: health.trackMuted,
    trackEnabled: track?.enabled ?? false,
    level: health.level,
    playSuccess: health.playSuccess,
    playFailed,
    inboundDeltaBytes: getPeerInboundDeltaBytes(remoteId),
  };
}

type PlayAttemptReason =
  | "mount_or_stream_changed"
  | "mount_ref"
  | "play_missing_retry"
  | "stream_present_but_never_played"
  | "replay"
  | "reattach_after_silent_playback"
  | "canplay"
  | "user_unlock";

function delayMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function RemoteAudio({
  stream,
  remoteId,
  replayReason = null,
  onSpeaking,
  onPlaybackHealthChange,
  onPlaybackUnconfirmedTimeout,
}: {
  stream: MediaStream;
  remoteId: string;
  replayReason?: string | null;
  onSpeaking?: (remoteId: string, level: number) => void;
  onPlaybackHealthChange?: (
    remoteId: string,
    health: RemotePlaybackHealth
  ) => void;
  onPlaybackUnconfirmedTimeout?: (remoteId: string) => void;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const instanceRef = useRef(createRemoteAudioInstanceId());
  const instanceId = instanceRef.current;
  const lastAttachedStreamIdRef = useRef<string | null>(null);
  const lastAttachedTrackIdRef = useRef<string | null>(null);
  const playbackCheckTimersRef = useRef<number[]>([]);
  const levelRef = useRef(0);
  const playSuccessRef = useRef(false);
  const provisionalPlaybackStartedAtRef = useRef<number | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const attachPerfLoggedRef = useRef(false);
  const lastPlayAttemptAtRef = useRef<number | null>(null);
  const firstConfirmedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream?.id || attachPerfLoggedRef.current) return;
    attachPerfLoggedRef.current = true;
    markVoicePerf("remote_audio_attached", {
      remoteId,
      extra: `stream=${compactMediaId(stream.id)}`,
    });
  }, [remoteId, stream]);
  const playSuccessAtRef = useRef<number | null>(null);
  const playFailedAtRef = useRef<number | null>(null);
  const lastAttachAtRef = useRef<number | null>(null);
  const playbackHealthLogAtRef = useRef(0);
  const silentReattachAttemptsRef = useRef(0);
  const lastSilentSuspectLogAtRef = useRef(0);
  const unconfirmedTimeoutFiredRef = useRef(false);
  const reattachInProgressRef = useRef(false);
  const periodicCheckIntervalRef = useRef<number | null>(null);
  const audioOutputConfigLogRef = useRef<{
    at: number;
    signature: string;
  } | null>(null);
  const attachLogThrottleRef = useRef(
    new Map<
      string,
      {
        at: number;
        willSkip: boolean;
        streamId: string;
        trackId: string;
      }
    >()
  );
  const fallbackActiveRef = useRef(false);
  const fallbackCtxRef = useRef<AudioContext | null>(null);
  const fallbackSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [blocked, setBlocked] = useState(false);

  const emitPlaybackHealth = useCallback(
    (health: RemotePlaybackHealth) => {
      const now = Date.now();
      if (now - playbackHealthLogAtRef.current >= PLAYBACK_HEALTH_LOG_THROTTLE_MS) {
        playbackHealthLogAtRef.current = now;
        const playSuccessAgeMs =
          health.lastPlaySuccessAt != null
            ? now - health.lastPlaySuccessAt
            : null;
        debugConsoleLog(
          `[remote-audio] playback-health remote=${compactRemoteId(remoteId)} ` +
            `playing=${health.audioActuallyPlaying} advanced=${health.currentTimeAdvanced} ` +
            `level=${health.level.toFixed(3)} trackReady=${health.trackReady} ` +
            `playSuccessAgeMs=${playSuccessAgeMs ?? "-"} mode=${health.playbackActiveMode} ${formatVoiceModeSuffix()}`
        );
      }
      onPlaybackHealthChange?.(remoteId, health);
    },
    [onPlaybackHealthChange, remoteId]
  );

  const logRemotePlaybackActive = useCallback(
    (health: RemotePlaybackHealth, reason: string) => {
      if (!health.playbackActive) return;
      const mode = health.playbackActiveMode;
      debugConsoleLog(
        `[remote-audio] playback-active remote=${compactRemoteId(remoteId)} mode=${mode} reason=${reason} ` +
          `trackReady=${health.trackReady} paused=${health.playSuccess ? "false" : "true"} ` +
          `advanced=${health.currentTimeAdvanced} level=${health.level.toFixed(3)} ${formatVoiceModeSuffix()}`
      );
    },
    [remoteId]
  );

  const publishPlaybackHealth = useCallback(
    (
      el: HTMLAudioElement,
      params: {
        playSuccess: boolean;
        playSuccessEvent?: boolean;
        currentTime: number;
        previousCurrentTime?: number;
        afterMs?: number;
      }
    ): RemotePlaybackHealth => {
      if (params.playSuccessEvent) {
        playFailedAtRef.current = null;
      }
      const baseHealth = evaluateRemotePlaybackHealth({
        el,
        stream,
        playSuccess: params.playSuccess,
        playSuccessEvent: params.playSuccessEvent,
        currentTime: params.currentTime,
        previousCurrentTime: params.previousCurrentTime,
        level: levelRef.current,
        webAudioFallback: fallbackActiveRef.current,
        provisionalStartedAt: provisionalPlaybackStartedAtRef.current,
        lastPlaySuccessAt: playSuccessAtRef.current,
        playFailedAt: playFailedAtRef.current,
        lastAttachAt: lastAttachAtRef.current,
        afterMs: params.afterMs,
      });
      const confirmInput = buildRemoteAudioConfirmInput({
        el,
        stream,
        health: baseHealth,
        remoteId,
        playFailed: playFailedAtRef.current != null,
      });
      const audioConfirmedStrict = evaluateAudioConfirmedStrict(confirmInput);
      logRemoteAudioConfirmCheck({
        remoteId,
        check: confirmInput,
        audioConfirmedStrict,
      });
      const health: RemotePlaybackHealth = {
        ...baseHealth,
        audioConfirmedStrict,
      };
      if (health.playbackActiveMode === "confirmed") {
        firstConfirmedAtRef.current = Date.now();
        silentReattachAttemptsRef.current = 0;
      }
      emitPlaybackHealth(health);

      const now = Date.now();
      logRemoteAudioPipeline({
        remoteDeviceId: remoteId,
        hasPc: true,
        conn: "-",
        ice: "-",
        hasStream: !!stream,
        trackReady: health.trackReady,
        ontrackAgeMs: lastAttachAtRef.current
          ? now - lastAttachAtRef.current
          : null,
        attached: el.srcObject === stream,
        audioPaused: el.paused,
        audioMuted: el.muted,
        volume: el.volume,
        readyState: el.readyState,
        playSuccessAgeMs: playSuccessAtRef.current
          ? now - playSuccessAtRef.current
          : null,
        currentTime: el.currentTime,
        advanced: health.currentTimeAdvanced,
        level: health.level,
        audioActuallyPlaying: health.audioActuallyPlaying,
        outputState: getSinkId(el),
      });

      return health;
    },
    [emitPlaybackHealth, remoteId, stream]
  );

  const playAudioRef = useRef<
    (opts?: {
      fromUnlock?: boolean;
      reason?: PlayAttemptReason;
      attempt?: number;
      maxAttempts?: number;
    }) => Promise<void>
  >(async () => {});

  const applyAudioOutputConfig = useCallback((el: HTMLAudioElement) => {
    el.muted = false;
    el.defaultMuted = false;
    el.volume = 1;
    el.autoplay = true;
    el.setAttribute("autoplay", "true");
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");

    const signature = `${el.muted}|${el.volume}|${el.autoplay}`;
    const now = Date.now();
    const prev = audioOutputConfigLogRef.current;
    const shouldLog =
      !prev ||
      prev.signature !== signature ||
      now - prev.at >= AUDIO_OUTPUT_CONFIG_LOG_THROTTLE_MS;

    if (shouldLog) {
      audioOutputConfigLogRef.current = { at: now, signature };
      debugConsoleLog(
        `[remote-audio] audio-output-config remote=${compactRemoteId(remoteId)} instance=${instanceId} muted=false volume=1 autoplay=true playsInline=true ${formatVoiceModeSuffix()}`
      );
    }
  }, [instanceId, remoteId]);

  const clearPlaybackChecks = useCallback(() => {
    for (const timer of playbackCheckTimersRef.current) {
      window.clearTimeout(timer);
    }
    playbackCheckTimersRef.current = [];
    if (periodicCheckIntervalRef.current != null) {
      window.clearInterval(periodicCheckIntervalRef.current);
      periodicCheckIntervalRef.current = null;
    }
  }, []);

  const applyOutputDevice = useCallback(async () => {
    const el = ref.current;
    if (!el) return;

    const sinkId = localStorage.getItem("audio_output_device");
    if (!sinkId) return;

    if ("setSinkId" in el) {
      try {
        await (el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(
          sinkId
        );
        debugConsoleLog("[call] output device applied", { remoteId, sinkId });
      } catch (e) {
        callWarn("[call] setSinkId failed", { remoteId, sinkId, e });
      }
    }
  }, [remoteId]);

  const activateIOSWebAudioFallback = useCallback(async () => {
    if (voicePolicy.voiceMode !== "ios_conservative") return false;
    if (isPlaybackTrackEnded(ref.current, stream)) return false;

    try {
      const Ctx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return false;

      if (!fallbackCtxRef.current || fallbackCtxRef.current.state === "closed") {
        fallbackCtxRef.current = new Ctx();
      }

      const ctx = fallbackCtxRef.current;
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }

      fallbackSourceRef.current?.disconnect();
      const source = ctx.createMediaStreamSource(stream);
      source.connect(ctx.destination);
      fallbackSourceRef.current = source;
      fallbackActiveRef.current = true;

      logRemoteAudioCompact(remoteId, ref.current!, stream, "webaudio-fallback", {
        ctxState: ctx.state,
        active: true,
      });

      const el = ref.current;
      if (el) {
        const health = publishPlaybackHealth(el, {
          playSuccess: playSuccessRef.current,
          currentTime: el.currentTime,
        });
        logRemotePlaybackActive(health, "webaudio_fallback");
      }

      return ctx.state === "running";
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      debugConsoleLog(
        `[remote-audio] webaudio-fallback-failed remote=${compactRemoteId(remoteId)} ` +
          `err=${err?.name ?? "unknown"} msg=${String(err?.message ?? "").slice(0, 80)}`
      );
      return false;
    }
  }, [emitPlaybackHealth, publishPlaybackHealth, remoteId, stream]);

  const schedulePlaybackChecksRef = useRef<
    (el: HTMLAudioElement, baselineTime: number) => void
  >(() => {});
  const attachStreamRef = useRef<(() => void) | null>(null);

  const logAttachSkipEndedTrack = useCallback(
    (track: MediaStreamTrack | null) => {
      debugConsoleLog(
        `[remote-audio] attach-skip-ended-track remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
          `streamId=${compactMediaId(stream.id)} trackId=${compactMediaId(track?.id)} ${formatVoiceModeSuffix()}`
      );
    },
    [instanceId, remoteId, stream]
  );

  const emitEndedTrackHealth = useCallback(() => {
    const track = getPlaybackTrack(ref.current, stream);
    playSuccessRef.current = false;
    playSuccessAtRef.current = null;
    playFailedAtRef.current = null;
    provisionalPlaybackStartedAtRef.current = null;
    const el = ref.current;
    if (el) {
      emitPlaybackHealth(
        evaluateRemotePlaybackHealth({
          el,
          stream,
          playSuccess: false,
          currentTime: el.currentTime,
          level: levelRef.current,
          webAudioFallback: fallbackActiveRef.current,
          provisionalStartedAt: null,
          lastPlaySuccessAt: null,
          playFailedAt: playFailedAtRef.current,
          lastAttachAt: lastAttachAtRef.current,
        })
      );
    }
  }, [emitPlaybackHealth, stream]);

  const playAudio = useCallback(
    async (opts?: {
      fromUnlock?: boolean;
      reason?: PlayAttemptReason;
      attempt?: number;
      maxAttempts?: number;
    }) => {
      const el = ref.current;
      if (!el || !stream) return;

      const playbackTrack = getPlaybackTrack(el, stream);
      if (!playbackTrack || playbackTrack.readyState === "ended") {
        return;
      }

      const reason = opts?.reason ?? (opts?.fromUnlock ? "user_unlock" : "mount_or_stream_changed");
      const allowWithoutGesture =
        opts?.fromUnlock === true ||
        reason === "mount_or_stream_changed" ||
        reason === "mount_ref" ||
        reason === "play_missing_retry" ||
        reason === "stream_present_but_never_played" ||
        reason === "replay" ||
        reason === "reattach_after_silent_playback" ||
        reason === "canplay" ||
        voicePolicy.aggressivePlayRetry;

      if (!allowWithoutGesture) {
        logRemoteAudioCompact(remoteId, el, stream, "play-skipped", {
          reason: "wait_user_gesture",
        });
        return;
      }

      lastPlayAttemptAtRef.current = Date.now();
      applyAudioOutputConfig(el);
      const attemptLabel =
        opts?.attempt != null && opts?.maxAttempts != null
          ? ` attempt=${opts.attempt}/${opts.maxAttempts}`
          : "";
      debugConsoleLog(
        `[remote-audio] play-attempt remote=${compactRemoteId(remoteId)} instance=${instanceId} reason=${reason}${attemptLabel} ` +
          `paused=${el.paused} muted=${el.muted} volume=${el.volume} readyState=${el.readyState} ` +
          `srcObjectSet=${el.srcObject === stream} ${formatVoiceModeSuffix()}`
      );

      try {
        await applyOutputDevice();
        await resumeSharedAudioContext();

        if (isPlaybackTrackEnded(el, stream)) {
          return;
        }

        await el.play();

        if (isPlaybackTrackEnded(el, stream)) {
          return;
        }

        setBlocked(false);
        playSuccessRef.current = true;
        const now = Date.now();
        playSuccessAtRef.current = now;
        playFailedAtRef.current = null;
        provisionalPlaybackStartedAtRef.current = now;

        logRemoteAudioCompact(remoteId, el, stream, "play-success");

        const health = publishPlaybackHealth(el, {
          playSuccess: true,
          playSuccessEvent: true,
          currentTime: el.currentTime,
        });
        logRemotePlaybackActive(health, "live_track_playing_no_meter");

        schedulePlaybackChecksRef.current(el, el.currentTime);

        if (opts?.fromUnlock && voicePolicy.voiceMode === "ios_conservative") {
          await activateIOSWebAudioFallback();
        }
      } catch (e: unknown) {
        if (isPlaybackTrackEnded(el, stream)) {
          return;
        }

        playSuccessRef.current = false;
        playSuccessAtRef.current = null;
        playFailedAtRef.current = Date.now();
        provisionalPlaybackStartedAtRef.current = null;
        const err = e as { name?: string; message?: string };
        const errName = err?.name ?? "unknown";
        const errMessage = String(err?.message ?? "").slice(0, 120);
        debugConsoleLog(
          `[remote-audio] play-failed remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
            `name=${errName} message=${errMessage} ${formatVoiceModeSuffix()}`
        );
        logRemoteAudioCompact(remoteId, el, stream, "play-failed", {
          name: errName,
          message: errMessage,
        });

        if (err?.name === "NotAllowedError") {
          setBlocked(true);
          callWarn("[call] autoplay blocked", remoteId);
          return;
        }

        if (err?.name === "AbortError") {
          callWarn("[call] remote audio play aborted", remoteId);
          return;
        }

        callWarn("[call] remote audio play error", remoteId, err?.name, err?.message);
      }
    },
    [
      activateIOSWebAudioFallback,
      applyAudioOutputConfig,
      applyOutputDevice,
      logRemotePlaybackActive,
      publishPlaybackHealth,
      remoteId,
      stream,
    ]
  );

  useEffect(() => {
    playAudioRef.current = playAudio;
  }, [playAudio]);

  const reattachAudioElement = useCallback(
    async (reason: string, attempt: number) => {
      const el = ref.current;
      if (!el || !stream || reattachInProgressRef.current) return;

      reattachInProgressRef.current = true;
      lastAttachedStreamIdRef.current = null;
      lastAttachedTrackIdRef.current = null;

      debugConsoleLog(
        `[remote-audio] reattach remote=${compactRemoteId(remoteId)} instance=${instanceId} reason=${reason} attempt=${attempt}/${MAX_SILENT_REATTACH_ATTEMPTS} ${formatVoiceModeSuffix()}`
      );
      logVoicePeerAutoRecover({
        remoteId,
        action: "reattach",
        reason,
      });

      try {
        el.pause();
        el.srcObject = null;
        await delayMs(REATTACH_DELAY_MS);

        if (isPlaybackTrackEnded(el, stream)) return;

        applyAudioOutputConfig(el);
        el.srcObject = stream;
        lastAttachedStreamIdRef.current = stream.id || null;
        lastAttachedTrackIdRef.current = stream.getAudioTracks()[0]?.id ?? null;

        try {
          el.load();
        } catch {
          // load() may throw on some streams; play() retry still runs
        }

        await playAudioRef.current({
          reason: "reattach_after_silent_playback",
          attempt,
          maxAttempts: MAX_SILENT_REATTACH_ATTEMPTS,
        });
      } finally {
        reattachInProgressRef.current = false;
      }
    },
    [applyAudioOutputConfig, instanceId, remoteId, stream]
  );

  const maybeHandleSilentPlaybackSuspect = useCallback(
    (el: HTMLAudioElement, health: RemotePlaybackHealth, level: number) => {
      if (!playSuccessRef.current || health.audioConfirmedStrict) {
        return;
      }

      const playSuccessAt = playSuccessAtRef.current;
      if (playSuccessAt == null) return;

      const elapsedMs = Date.now() - playSuccessAt;
      if (elapsedMs < SILENT_PLAYBACK_SUSPECT_MS) return;

      const now = Date.now();
      if (now - lastSilentSuspectLogAtRef.current < SILENT_PLAYBACK_SUSPECT_MS) {
        return;
      }
      lastSilentSuspectLogAtRef.current = now;

      const safari = getSafariAudioDebug(el);
      debugConsoleLog(
        `[remote-audio] silent-playback-suspect remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
          `reason=play_success_but_unconfirmed elapsedMs=${elapsedMs} currentTime=${el.currentTime.toFixed(2)} ` +
          `level=${level.toFixed(3)} advanced=${health.currentTimeAdvanced} decodedBytes=${safari.webkitAudioDecodedByteCount ?? "-"} ${formatVoiceModeSuffix()}`
      );

      if (reattachInProgressRef.current) return;

      if (silentReattachAttemptsRef.current >= MAX_SILENT_REATTACH_ATTEMPTS) {
        if (!unconfirmedTimeoutFiredRef.current) {
          unconfirmedTimeoutFiredRef.current = true;
          onPlaybackUnconfirmedTimeout?.(remoteId);
        }
        return;
      }

      silentReattachAttemptsRef.current += 1;
      void reattachAudioElement(
        "silent_playback_suspect",
        silentReattachAttemptsRef.current
      );
    },
    [instanceId, onPlaybackUnconfirmedTimeout, reattachAudioElement, remoteId]
  );

  const schedulePlaybackChecks = useCallback(
    (el: HTMLAudioElement, baselineTime: number) => {
      clearPlaybackChecks();

      const runCheck = (afterMs: number, previousCurrentTime: number) => {
        if (isPlaybackTrackEnded(el, stream)) return;

        const currentTime = el.currentTime;
        const level = levelRef.current;

        const health = publishPlaybackHealth(el, {
          playSuccess: playSuccessRef.current,
          currentTime,
          previousCurrentTime,
          afterMs,
        });

        if (health.audioConfirmedStrict) {
          firstConfirmedAtRef.current = Date.now();
          silentReattachAttemptsRef.current = 0;
          unconfirmedTimeoutFiredRef.current = false;
        }

        logPlaybackCheck({
          remoteId,
          instanceId,
          el,
          stream,
          afterMs,
          previousCurrentTime,
          level,
          health,
        });

        if (health.playbackActive) {
          logRemotePlaybackActive(health, "playback_check_confirmed");
        }

        maybeHandleSilentPlaybackSuspect(el, health, level);

        if (
          voicePolicy.voiceMode === "ios_conservative" &&
          afterMs >= 1500 &&
          !health.verified &&
          playSuccessRef.current
        ) {
          debugConsoleLog(
            `[remote-audio] playback-stalled remote=${compactRemoteId(remoteId)} ` +
              `ios=true hint=tap_screen_for_webaudio advanced=${health.currentTimeAdvanced} level=${level.toFixed(3)}`
          );
        }
      };

      let rollingTime = baselineTime;
      const runScheduled = (afterMs: number) => {
        runCheck(afterMs, rollingTime);
        rollingTime = el.currentTime;
      };

      for (const afterMs of [500, 1500, 5000]) {
        const timer = window.setTimeout(() => {
          runScheduled(afterMs);
        }, afterMs);
        playbackCheckTimersRef.current.push(timer);
      }

      periodicCheckIntervalRef.current = window.setInterval(() => {
        if (!playSuccessRef.current) {
          const sinceAttempt = lastPlayAttemptAtRef.current
            ? Date.now() - lastPlayAttemptAtRef.current
            : Date.now() - mountedAtRef.current;
          if (sinceAttempt >= PLAYBACK_CHECK_INTERVAL_MS) {
            lastAttachedStreamIdRef.current = null;
            lastAttachedTrackIdRef.current = null;
            attachStreamRef.current?.();
            logVoicePeerAutoRecover({
              remoteId,
              action: "play_retry",
              reason: "play_missing_retry",
            });
            void playAudioRef.current({ reason: "play_missing_retry" });
          }
          return;
        }
        runScheduled(PLAYBACK_CHECK_INTERVAL_MS);
      }, PLAYBACK_CHECK_INTERVAL_MS);
    },
    [
      clearPlaybackChecks,
      instanceId,
      logRemotePlaybackActive,
      maybeHandleSilentPlaybackSuspect,
      publishPlaybackHealth,
      remoteId,
      stream,
    ]
  );

  useEffect(() => {
    schedulePlaybackChecksRef.current = schedulePlaybackChecks;
  }, [schedulePlaybackChecks]);

  const unlockRemoteAudio = useCallback(() => {
    void playAudio({ fromUnlock: true, reason: "user_unlock" });
  }, [playAudio]);

  useEffect(() => {
    return registerRemoteAudioPlayAll(() => {
      void playAudio({ fromUnlock: true, reason: "user_unlock" });
    });
  }, [playAudio]);

  const logStreamProps = useCallback(
    (tag: string) => {
      const track = stream?.getAudioTracks?.()[0] ?? null;
      debugConsoleLog(
        `[remote-audio] props remote=${compactRemoteId(remoteId)} instance=${instanceId} tag=${tag} ` +
          `hasStream=${!!stream} streamId=${compactMediaId(stream?.id)} tracks=${stream?.getAudioTracks?.().length ?? 0} ` +
          `trackId=${compactMediaId(track?.id)} trackReady=${track?.readyState ?? "-"} replayReason=${replayReason ?? "-"} ${formatVoiceModeSuffix()}`
      );
    },
    [instanceId, remoteId, replayReason, stream]
  );

  useEffect(() => {
    mountedAtRef.current = Date.now();
    const track = stream?.getAudioTracks?.()[0] ?? null;
    debugConsoleLog(
      `[remote-audio] mount remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
        `streamId=${compactMediaId(stream?.id)} trackId=${compactMediaId(track?.id)} trackReady=${track?.readyState ?? "-"} ${formatVoiceModeSuffix()}`
    );
    logStreamProps("mount");
    return () => {
      debugConsoleLog(
        `[remote-audio] unmount remote=${compactRemoteId(remoteId)} instance=${instanceId} reason=${replayReason ?? "component_unmount"} ${formatVoiceModeSuffix()}`
      );
      lastAttachedStreamIdRef.current = null;
      lastAttachedTrackIdRef.current = null;
    };
  }, [instanceId, logStreamProps, remoteId, replayReason, stream]);

  useEffect(() => {
    logStreamProps("stream_changed");
  }, [logStreamProps, stream]);

  const attemptPlay = useCallback(
    (reason: PlayAttemptReason) => {
      void playAudio({ reason });
    },
    [playAudio]
  );

  const attachStream = useCallback(() => {
    const track = stream?.getAudioTracks?.()[0] ?? null;
    if (!track || track.readyState === "ended") {
      logAttachSkipEndedTrack(track);
      emitEndedTrackHealth();
      return;
    }

    const el = ref.current;
    if (!el || !stream) return;

    applyAudioOutputConfig(el);

    const streamId = stream.id ?? "";
    const trackId = track.id ?? "";
    const prevStreamId = lastAttachedStreamIdRef.current ?? "";
    const prevTrackId = lastAttachedTrackIdRef.current ?? "";
    const sameStream = Boolean(streamId && prevStreamId && streamId === prevStreamId);
    const sameTrack = Boolean(trackId && prevTrackId && trackId === prevTrackId);
    const sameSrcObject = el.srcObject === stream;
    const willSkip = Boolean(
      streamId && trackId && sameStream && sameTrack && sameSrcObject
    );

    const attachLogKey = `${remoteId}|${streamId}|${trackId}|${instanceId}`;
    const now = Date.now();
    const prevAttachLog = attachLogThrottleRef.current.get(attachLogKey);
    const attachStateChanged =
      !prevAttachLog ||
      prevAttachLog.willSkip !== willSkip ||
      prevAttachLog.streamId !== streamId ||
      prevAttachLog.trackId !== trackId;
    const shouldLogAttach =
      attachStateChanged ||
      !prevAttachLog ||
      now - prevAttachLog.at >= ATTACH_LOG_THROTTLE_MS;

    if (shouldLogAttach) {
      attachLogThrottleRef.current.set(attachLogKey, {
        at: now,
        willSkip,
        streamId,
        trackId,
      });
      debugConsoleLog(
        `[remote-audio] attach-check remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
          `streamId=${compactMediaId(streamId)} prevStreamId=${compactMediaId(prevStreamId)} ` +
          `trackId=${compactMediaId(trackId)} prevTrackId=${compactMediaId(prevTrackId)} ` +
          `sameStream=${sameStream} sameTrack=${sameTrack} sameSrcObject=${sameSrcObject} willSkip=${willSkip}`
      );
    }

    if (willSkip) {
      if (isPlaybackTrackEnded(el, stream)) {
        logAttachSkipEndedTrack(getPlaybackTrack(el, stream));
        emitEndedTrackHealth();
        return;
      }
      if (shouldLogAttach) {
        debugConsoleLog(
          `[remote-audio] attach-skip-same-stream remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
            `streamId=${compactMediaId(streamId)} trackId=${compactMediaId(trackId)} ${formatVoiceModeSuffix()}`
        );
      }
      return;
    }

    const trackChanged = trackId !== lastAttachedTrackIdRef.current;
    const streamChanged = streamId !== lastAttachedStreamIdRef.current;

    if (voicePolicy.clearAudioSrcBeforeReattach && el.srcObject && (streamChanged || trackChanged)) {
      el.srcObject = null;
    }

    if (isPlaybackTrackEnded(el, stream)) {
      logAttachSkipEndedTrack(track);
      emitEndedTrackHealth();
      return;
    }

    el.srcObject = stream;
    lastAttachAtRef.current = Date.now();
    lastAttachedStreamIdRef.current = streamId || null;
    lastAttachedTrackIdRef.current = trackId || null;

    const attachTag = trackChanged || streamChanged ? "attach-track-changed" : "attach";
    logRemoteAudioCompact(remoteId, el, stream, attachTag);

    attemptPlay("mount_or_stream_changed");
  }, [
    applyAudioOutputConfig,
    attemptPlay,
    emitEndedTrackHealth,
    instanceId,
    logAttachSkipEndedTrack,
    remoteId,
    stream,
  ]);

  useEffect(() => {
    attachStreamRef.current = attachStream;
  }, [attachStream]);

  useEffect(() => {
    if (!replayReason) return;
    lastAttachedStreamIdRef.current = null;
    lastAttachedTrackIdRef.current = null;
    const el = ref.current;
    if (!el) return;
    attachStream();
    attemptPlay("stream_present_but_never_played");
  }, [attachStream, attemptPlay, replayReason]);

  const bindAudioElement = useCallback(
    (node: HTMLAudioElement | null) => {
      ref.current = node;
      if (!node || !stream) return;
      applyAudioOutputConfig(node);
      attachStream();
    },
    [applyAudioOutputConfig, attachStream, stream]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onCanPlay = () => {
      attemptPlay("canplay");
    };

    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("loadedmetadata", onCanPlay);

    const onAddTrack = () => {
      attachStream();
    };

    stream.addEventListener("addtrack", onAddTrack);

    for (const streamTrack of stream.getAudioTracks()) {
      streamTrack.onended = () => {
        logAttachSkipEndedTrack(streamTrack);
        emitEndedTrackHealth();
      };
      streamTrack.onunmute = () => {
        attachStream();
      };
    }

    attachStream();

    let retryTimer = 0;
    retryTimer = window.setTimeout(() => {
      attachStream();
    }, voicePolicy.ontrackDelayedPlayMs ?? 300);

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      clearPlaybackChecks();
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("loadedmetadata", onCanPlay);
      stream.removeEventListener("addtrack", onAddTrack);
      for (const streamTrack of stream.getAudioTracks()) {
        streamTrack.onended = null;
        streamTrack.onunmute = null;
      }
      fallbackSourceRef.current?.disconnect();
      fallbackSourceRef.current = null;
      fallbackActiveRef.current = false;
      if (fallbackCtxRef.current) {
        void fallbackCtxRef.current.close().catch(() => {});
        fallbackCtxRef.current = null;
      }
    };
  }, [
    attachStream,
    clearPlaybackChecks,
    applyAudioOutputConfig,
    emitEndedTrackHealth,
    logAttachSkipEndedTrack,
    playAudio,
    stream,
  ]);

  useEffect(() => {
    return subscribeRemoteAudioUnlock(unlockRemoteAudio);
  }, [unlockRemoteAudio]);

  useEffect(() => {
    if (!voicePolicy.aggressivePlayRetry) {
      return;
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void playAudio({ fromUnlock: true, reason: "user_unlock" });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [playAudio]);

  useEffect(() => {
    if (voicePolicy.disableRemoteAudioMeter) {
      return;
    }

    let raf = 0;
    let closed = false;
    let ctx: AudioContext | null = null;

    async function run() {
      try {
        const Ctx =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctx) return;

        ctx = new Ctx();

        if (ctx.state === "suspended") {
          await ctx.resume().catch(() => {});
        }

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = async () => {
          if (closed) return;

          if (ctx?.state === "suspended") {
            await ctx.resume().catch(() => {});
          }

          analyser.getByteTimeDomainData(data);

          let sum = 0;

          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }

          const rms = Math.sqrt(sum / data.length);
          const level = Math.min(1, Math.max(0, (rms - 0.005) * 12));
          levelRef.current = level;

          if (level > 0.08) {
            onSpeaking?.(remoteId, level);
          }

          if (level > 0.02 && playSuccessRef.current) {
            const el = ref.current;
            if (el) {
              const health = publishPlaybackHealth(el, {
                playSuccess: true,
                currentTime: el.currentTime,
              });
              if (health.playbackActive) {
                logRemotePlaybackActive(health, "meter");
              }
            }
          }

          raf = requestAnimationFrame(tick);
        };

        tick();
      } catch {
        // remote meter is optional
      }
    }

    void run();

    return () => {
      closed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ctx) void ctx.close().catch(() => {});
    };
  }, [logRemotePlaybackActive, onSpeaking, publishPlaybackHealth, remoteId, stream]);

  return (
    <>
      <audio
        ref={bindAudioElement}
        data-remote={remoteId}
        playsInline
        muted={false}
        style={{ display: "none" }}
      />

      {blocked && (
        <button
          type="button"
          onClick={() => {
            requestRemoteAudioUnlock();
            void playAudio({ fromUnlock: true, reason: "user_unlock" });
          }}
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.16)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          🔊 音声を再生する
        </button>
      )}
    </>
  );
}
