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

export type RemotePlaybackHealth = {
  playSuccess: boolean;
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

function buildPlaybackHealth(params: {
  playSuccess: boolean;
  currentTimeAdvanced: boolean;
  trackMuted: boolean;
  trackReady: string;
  level: number;
  webAudioFallback: boolean;
  elPaused: boolean;
  afterMs?: number;
}): RemotePlaybackHealth {
  const {
    playSuccess,
    currentTimeAdvanced,
    trackMuted,
    trackReady,
    level,
    webAudioFallback,
    elPaused,
    afterMs = 0,
  } = params;

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

      emitPlaybackHealth(
        buildPlaybackHealth({
          playSuccess: playSuccessRef.current,
          currentTimeAdvanced: false,
          trackMuted: stream.getAudioTracks()[0]?.muted ?? false,
          trackReady: stream.getAudioTracks()[0]?.readyState ?? "-",
          level: levelRef.current,
          webAudioFallback: true,
          elPaused: ref.current?.paused ?? true,
        })
      );

      return ctx.state === "running";
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      console.log(
        `[remote-audio] webaudio-fallback-failed remote=${compactRemoteId(remoteId)} ` +
          `err=${err?.name ?? "unknown"} msg=${String(err?.message ?? "").slice(0, 80)}`
      );
      return false;
    }
  }, [emitPlaybackHealth, remoteId, stream]);

  const schedulePlaybackChecks = useCallback(
    (el: HTMLAudioElement, baselineTime: number) => {
      clearPlaybackChecks();

      for (const afterMs of [500, 1500]) {
        const timer = window.setTimeout(() => {
          const track = stream.getAudioTracks()[0];
          const currentTime = el.currentTime;
          const advanced = currentTime > baselineTime + 0.01;
          const level = levelRef.current;

          logRemoteAudioCompact(remoteId, el, stream, "playback-check", {
            afterMs,
            advanced,
            level: level.toFixed(3),
          });

          const health = buildPlaybackHealth({
            playSuccess: playSuccessRef.current,
            currentTimeAdvanced: advanced,
            trackMuted: track?.muted ?? false,
            trackReady: track?.readyState ?? "-",
            level,
            webAudioFallback: fallbackActiveRef.current,
            elPaused: el.paused,
            afterMs,
          });

          emitPlaybackHealth(health);

          if (
            voicePolicy.voiceMode === "ios_conservative" &&
            afterMs >= 1500 &&
            !health.verified &&
            playSuccessRef.current
          ) {
            console.log(
              `[remote-audio] playback-stalled remote=${compactRemoteId(remoteId)} ` +
                `ios=true hint=tap_screen_for_webaudio advanced=${advanced} level=${level.toFixed(3)}`
            );
          }
        }, afterMs);

        playbackCheckTimersRef.current.push(timer);
      }
    },
    [clearPlaybackChecks, emitPlaybackHealth, remoteId, stream]
  );

  const configureAudioElement = useCallback((el: HTMLAudioElement) => {
    el.autoplay = true;
    el.setAttribute("autoplay", "true");
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.volume = 1;
    el.muted = false;
    el.defaultMuted = false;
  }, []);

  const playAudio = useCallback(
    async (opts?: { fromUnlock?: boolean }) => {
      const el = ref.current;
      if (!el || !stream) return;

      const track = stream.getAudioTracks()[0];
      if (track?.readyState === "ended") {
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
        await el.play();

        setBlocked(false);
        playSuccessRef.current = true;

        logRemoteAudioCompact(remoteId, el, stream, "play-success");

        const track = stream.getAudioTracks()[0];
        emitPlaybackHealth(
          buildPlaybackHealth({
            playSuccess: true,
            currentTimeAdvanced: false,
            trackMuted: track?.muted ?? false,
            trackReady: track?.readyState ?? "-",
            level: levelRef.current,
            webAudioFallback: fallbackActiveRef.current,
            elPaused: el.paused,
          })
        );

        schedulePlaybackChecks(el, el.currentTime);

        if (opts?.fromUnlock && voicePolicy.voiceMode === "ios_conservative") {
          await activateIOSWebAudioFallback();
        }
      } catch (e: unknown) {
        playSuccessRef.current = false;
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
      emitPlaybackHealth,
      remoteId,
      schedulePlaybackChecks,
      stream,
    ]
  );

  const unlockRemoteAudio = useCallback(() => {
    void playAudio({ fromUnlock: true });
  }, [playAudio]);

  const emitEndedTrackHealth = useCallback(() => {
    const track = stream.getAudioTracks()[0];
    playSuccessRef.current = false;
    emitPlaybackHealth(
      buildPlaybackHealth({
        playSuccess: false,
        currentTimeAdvanced: false,
        trackMuted: track?.muted ?? false,
        trackReady: "ended",
        level: levelRef.current,
        webAudioFallback: fallbackActiveRef.current,
        elPaused: ref.current?.paused ?? true,
      })
    );
  }, [emitPlaybackHealth, stream]);

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
    const el = ref.current;
    if (!el || !stream) return;

    const track = stream.getAudioTracks()[0] ?? null;
    if (track?.readyState === "ended") {
      console.log(
        `[remote-audio] attach-skip-ended-track remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
          `streamId=${compactMediaId(stream.id)} trackId=${compactMediaId(track.id)} ${formatVoiceModeSuffix()}`
      );
      emitEndedTrackHealth();
      return;
    }

    configureAudioElement(el);

    const streamId = stream.id ?? "";
    const trackId = track?.id ?? "";
    const prevStreamId = lastAttachedStreamIdRef.current ?? "";
    const prevTrackId = lastAttachedTrackIdRef.current ?? "";
    const sameStream = Boolean(streamId && prevStreamId && streamId === prevStreamId);
    const sameTrack = Boolean(trackId && prevTrackId && trackId === prevTrackId);
    const sameSrcObject = el.srcObject === stream;
    const willSkip = Boolean(
      streamId && trackId && sameStream && sameTrack && sameSrcObject
    );

    console.log(
      `[remote-audio] attach-check remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
        `streamId=${compactMediaId(streamId)} prevStreamId=${compactMediaId(prevStreamId)} ` +
        `trackId=${compactMediaId(trackId)} prevTrackId=${compactMediaId(prevTrackId)} ` +
        `sameStream=${sameStream} sameTrack=${sameTrack} sameSrcObject=${sameSrcObject} willSkip=${willSkip}`
    );

    if (willSkip) {
      console.log(
        `[remote-audio] attach-skip-same-stream remote=${compactRemoteId(remoteId)} instance=${instanceId} ` +
          `streamId=${compactMediaId(streamId)} trackId=${compactMediaId(trackId)} ${formatVoiceModeSuffix()}`
      );
      return;
    }

    const trackChanged = trackId !== lastAttachedTrackIdRef.current;
    const streamChanged = streamId !== lastAttachedStreamIdRef.current;

    if (voicePolicy.clearAudioSrcBeforeReattach && el.srcObject && (streamChanged || trackChanged)) {
      el.srcObject = null;
    }

    el.srcObject = stream;
    lastAttachedStreamIdRef.current = streamId || null;
    lastAttachedTrackIdRef.current = trackId || null;

    logRemoteAudioCompact(
      remoteId,
      el,
      stream,
      trackChanged || streamChanged ? "attach-track-changed" : "attach"
    );

    if (voicePolicy.aggressivePlayRetry) {
      void playAudio();
    }
  }, [
    configureAudioElement,
    emitEndedTrackHealth,
    instanceId,
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
      if (voicePolicy.aggressivePlayRetry) {
        void playAudio();
      }
    };

    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("loadedmetadata", onCanPlay);

    const onAddTrack = () => {
      attachStream();
    };

    stream.addEventListener("addtrack", onAddTrack);

    for (const track of stream.getAudioTracks()) {
      track.onunmute = () => {
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
            emitPlaybackHealth(
              buildPlaybackHealth({
                playSuccess: true,
                currentTimeAdvanced: false,
                trackMuted: stream.getAudioTracks()[0]?.muted ?? false,
                trackReady: stream.getAudioTracks()[0]?.readyState ?? "live",
                level,
                webAudioFallback: fallbackActiveRef.current,
                elPaused: ref.current?.paused ?? true,
              })
            );
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
  }, [emitPlaybackHealth, onSpeaking, remoteId, stream]);

  return (
    <>
      <audio
        ref={ref}
        data-remote={remoteId}
        autoPlay
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
