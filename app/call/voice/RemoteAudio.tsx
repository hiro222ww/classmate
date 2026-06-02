"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatVoiceModeSuffix,
  getVoiceModePolicy,
} from "@/lib/voiceClientEnv";
import {
  requestRemoteAudioUnlock,
  resumeSharedAudioContext,
  subscribeRemoteAudioUnlock,
} from "@/lib/remoteAudioUnlock";

const voicePolicy = getVoiceModePolicy();
const ATTACH_LOG_THROTTLE_MS = 5000;
const PROVISIONAL_PLAYBACK_MS = 15000;

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
};

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

  console.log(parts.join(" "));
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
  afterMs?: number;
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
    afterMs = 0,
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
    (currentTimeAdvanced || level > 0);

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
    Date.now() - provisionalStartedAt < PROVISIONAL_PLAYBACK_MS;

  const playbackActive = confirmedActive || provisionalActive;
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
  };
}

export default function RemoteAudio({
  stream,
  remoteId,
  onSpeaking,
  onPlaybackHealthChange,
}: {
  stream: MediaStream;
  remoteId: string;
  onSpeaking?: (remoteId: string, level: number) => void;
  onPlaybackHealthChange?: (
    remoteId: string,
    health: RemotePlaybackHealth
  ) => void;
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
      onPlaybackHealthChange?.(remoteId, health);
    },
    [onPlaybackHealthChange, remoteId]
  );

  const logRemotePlaybackActive = useCallback(
    (health: RemotePlaybackHealth, reason: string) => {
      if (!health.playbackActive) return;
      const mode = health.playbackActiveMode;
      console.log(
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
      const health = evaluateRemotePlaybackHealth({
        el,
        stream,
        playSuccess: params.playSuccess,
        playSuccessEvent: params.playSuccessEvent,
        currentTime: params.currentTime,
        previousCurrentTime: params.previousCurrentTime,
        level: levelRef.current,
        webAudioFallback: fallbackActiveRef.current,
        provisionalStartedAt: provisionalPlaybackStartedAtRef.current,
        afterMs: params.afterMs,
      });
      emitPlaybackHealth(health);
      return health;
    },
    [emitPlaybackHealth, stream]
  );

  const clearPlaybackChecks = useCallback(() => {
    for (const timer of playbackCheckTimersRef.current) {
      window.clearTimeout(timer);
    }
    playbackCheckTimersRef.current = [];
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
        console.log("[call] output device applied", { remoteId, sinkId });
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
      console.log(
        `[remote-audio] webaudio-fallback-failed remote=${compactRemoteId(remoteId)} ` +
          `err=${err?.name ?? "unknown"} msg=${String(err?.message ?? "").slice(0, 80)}`
      );
      return false;
    }
  }, [emitPlaybackHealth, publishPlaybackHealth, remoteId, stream]);

  const schedulePlaybackChecks = useCallback(
    (el: HTMLAudioElement, baselineTime: number) => {
      clearPlaybackChecks();

      for (const afterMs of [500, 1500]) {
        const timer = window.setTimeout(() => {
          if (isPlaybackTrackEnded(el, stream)) {
            return;
          }

          const track = getPlaybackTrack(el, stream);
          const currentTime = el.currentTime;
          const level = levelRef.current;

          const health = evaluateRemotePlaybackHealth({
            el,
            stream,
            playSuccess: playSuccessRef.current,
            currentTime,
            previousCurrentTime: baselineTime,
            level,
            webAudioFallback: fallbackActiveRef.current,
            provisionalStartedAt: provisionalPlaybackStartedAtRef.current,
            afterMs,
          });

          const emitted = health.playbackActive;
          logRemoteAudioCompact(remoteId, el, stream, "playback-check", {
            afterMs,
            currentTime: currentTime.toFixed(2),
            previousCurrentTime: baselineTime.toFixed(2),
            advanced: health.currentTimeAdvanced,
            level: level.toFixed(3),
            paused: el.paused,
            readyState: el.readyState,
            trackReady: track?.readyState ?? "-",
            playbackActive: health.playbackActive,
            playbackActiveMode: health.playbackActiveMode,
            emitted,
          });

          if (emitted) {
            emitPlaybackHealth(health);
            logRemotePlaybackActive(
              health,
              health.playbackActiveMode === "provisional"
                ? "live_track_playing_no_meter"
                : "playback_check"
            );
          }

          if (
            voicePolicy.voiceMode === "ios_conservative" &&
            afterMs >= 1500 &&
            !health.verified &&
            playSuccessRef.current
          ) {
            console.log(
              `[remote-audio] playback-stalled remote=${compactRemoteId(remoteId)} ` +
                `ios=true hint=tap_screen_for_webaudio advanced=${health.currentTimeAdvanced} level=${level.toFixed(3)}`
            );
          }
        }, afterMs);

        playbackCheckTimersRef.current.push(timer);
      }
    },
    [clearPlaybackChecks, emitPlaybackHealth, logRemotePlaybackActive, remoteId, stream]
  );

  const configureAudioElement = useCallback((el: HTMLAudioElement) => {
    el.autoplay = false;
    el.removeAttribute("autoplay");
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.volume = 1;
    el.muted = false;
    el.defaultMuted = false;
  }, []);

  const logAttachSkipEndedTrack = useCallback(
    (track: MediaStreamTrack | null) => {
      console.log(
        `[remote-audio] attach-skip-ended-track remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
          `streamId=${compactMediaId(stream.id)} trackId=${compactMediaId(track?.id)} ${formatVoiceModeSuffix()}`
      );
    },
    [instanceId, remoteId, stream]
  );

  const emitEndedTrackHealth = useCallback(() => {
    const track = getPlaybackTrack(ref.current, stream);
    playSuccessRef.current = false;
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
        })
      );
    }
  }, [emitPlaybackHealth, stream]);

  const playAudio = useCallback(
    async (opts?: { fromUnlock?: boolean }) => {
      const el = ref.current;
      if (!el || !stream) return;

      const playbackTrack = getPlaybackTrack(el, stream);
      if (!playbackTrack || playbackTrack.readyState === "ended") {
        return;
      }

      if (!voicePolicy.aggressivePlayRetry && opts?.fromUnlock !== true) {
        logRemoteAudioCompact(remoteId, el, stream, "play-skipped", {
          reason: "wait_user_gesture",
        });
        return;
      }

      configureAudioElement(el);

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
        provisionalPlaybackStartedAtRef.current = Date.now();

        logRemoteAudioCompact(remoteId, el, stream, "play-success");

        const health = publishPlaybackHealth(el, {
          playSuccess: true,
          playSuccessEvent: true,
          currentTime: el.currentTime,
        });
        logRemotePlaybackActive(health, "live_track_playing_no_meter");

        schedulePlaybackChecks(el, el.currentTime);

        if (opts?.fromUnlock && voicePolicy.voiceMode === "ios_conservative") {
          await activateIOSWebAudioFallback();
        }
      } catch (e: unknown) {
        if (isPlaybackTrackEnded(el, stream)) {
          return;
        }

        playSuccessRef.current = false;
        provisionalPlaybackStartedAtRef.current = null;
        const err = e as { name?: string; message?: string };
        logRemoteAudioCompact(remoteId, el, stream, "play-failed", {
          err: err?.name ?? "unknown",
          msg: String(err?.message ?? "").slice(0, 80),
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
      applyOutputDevice,
      configureAudioElement,
      logRemotePlaybackActive,
      publishPlaybackHealth,
      remoteId,
      schedulePlaybackChecks,
      stream,
    ]
  );

  const unlockRemoteAudio = useCallback(() => {
    void playAudio({ fromUnlock: true });
  }, [playAudio]);

  useEffect(() => {
    console.log(
      `[remote-audio] mount remote=${compactRemoteId(remoteId)} instance=${instanceId}`
    );
    return () => {
      console.log(
        `[remote-audio] unmount remote=${compactRemoteId(remoteId)} instance=${instanceId}`
      );
      lastAttachedStreamIdRef.current = null;
      lastAttachedTrackIdRef.current = null;
    };
  }, [instanceId, remoteId]);

  const attachStream = useCallback(() => {
    const track = stream?.getAudioTracks?.()[0] ?? null;
    if (!track || track.readyState === "ended") {
      logAttachSkipEndedTrack(track);
      emitEndedTrackHealth();
      return;
    }

    const el = ref.current;
    if (!el || !stream) return;

    configureAudioElement(el);

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
      console.log(
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
        console.log(
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
    lastAttachedStreamIdRef.current = streamId || null;
    lastAttachedTrackIdRef.current = trackId || null;

    const attachTag = trackChanged || streamChanged ? "attach-track-changed" : "attach";
    logRemoteAudioCompact(remoteId, el, stream, attachTag);

    if (voicePolicy.aggressivePlayRetry) {
      void playAudio();
    }
  }, [
    configureAudioElement,
    emitEndedTrackHealth,
    instanceId,
    logAttachSkipEndedTrack,
    playAudio,
    remoteId,
    stream,
  ]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    configureAudioElement(el);
    attachStream();

    const onCanPlay = () => {
      void playAudio();
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

    let retryTimer = 0;
    if (voicePolicy.aggressivePlayRetry) {
      retryTimer = window.setTimeout(() => {
        attachStream();
      }, voicePolicy.ontrackDelayedPlayMs ?? 300);
    }

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
    configureAudioElement,
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
        void playAudio({ fromUnlock: true });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [playAudio]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;

    let lastSampledTime = el.currentTime;

    const timer = window.setInterval(() => {
      if (!playSuccessRef.current) return;
      if (isPlaybackTrackEnded(el, stream)) return;

      const track = getPlaybackTrack(el, stream);
      if (!track || track.readyState !== "live") return;

      const currentTime = el.currentTime;
      const previousCurrentTime = lastSampledTime;
      const level = levelRef.current;

      const health = evaluateRemotePlaybackHealth({
        el,
        stream,
        playSuccess: true,
        currentTime,
        previousCurrentTime,
        level,
        webAudioFallback: fallbackActiveRef.current,
        provisionalStartedAt: provisionalPlaybackStartedAtRef.current,
      });

      const emitted = health.playbackActive;
      console.log(
        `[remote-audio] playback-active-check remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
          `afterMs=2000 currentTime=${currentTime.toFixed(2)} previousCurrentTime=${previousCurrentTime.toFixed(2)} ` +
          `advanced=${health.currentTimeAdvanced} level=${level.toFixed(3)} paused=${el.paused} ` +
          `readyState=${el.readyState} trackReady=${track.readyState} playbackActive=${health.playbackActive} ` +
          `playbackActiveMode=${health.playbackActiveMode} emitted=${emitted} ${formatVoiceModeSuffix()}`
      );

      if (health.currentTimeAdvanced) {
        lastSampledTime = currentTime;
      }

      if (emitted) {
        emitPlaybackHealth(health);
        logRemotePlaybackActive(
          health,
          health.playbackActiveMode === "provisional"
            ? "live_track_playing_no_meter"
            : "interval_check"
        );
      }
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [emitPlaybackHealth, instanceId, logRemotePlaybackActive, remoteId, stream]);

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
        ref={ref}
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
            void playAudio({ fromUnlock: true });
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
