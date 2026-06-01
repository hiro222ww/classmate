"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeRemoteAudioUnlock } from "@/lib/remoteAudioUnlock";

function callWarn(...args: unknown[]) {
  console.warn(...args);
}

function isWindowsClient() {
  if (typeof navigator === "undefined") return false;
  return /windows/i.test(navigator.userAgent);
}

function compactRemoteId(remoteId: string): string {
  const value = String(remoteId ?? "").trim();
  if (!value) return "-";
  if (value.length <= 4) return value;
  return value.slice(-3);
}

function logRemoteAudioState(
  remoteId: string,
  el: HTMLAudioElement,
  stream: MediaStream,
  tag: string,
  error?: { name?: string; message?: string }
) {
  const tracks = stream.getAudioTracks();
  const track = tracks[0];
  const compact =
    `[remote-audio] ${tag} remote=${compactRemoteId(remoteId)} ` +
    `srcObject=${el.srcObject === stream} tracks=${tracks.length} ` +
    `ready=${track?.readyState ?? "-"} muted=${track?.muted ?? "-"} ` +
    `paused=${el.paused} vol=${el.volume}` +
    (error?.name ? ` err=${error.name}` : "") +
    (error?.message ? ` msg=${error.message.slice(0, 80)}` : "");

  console.log(compact);
  console.log("[remote-audio] state", {
    remoteId,
    tag,
    srcObjectSet: el.srcObject === stream,
    audioTracks: tracks.length,
    tracks: tracks.map((t) => ({
      id: t.id,
      readyState: t.readyState,
      muted: t.muted,
      enabled: t.enabled,
    })),
    paused: el.paused,
    muted: el.muted,
    volume: el.volume,
    ...(error
      ? {
          errorName: error.name ?? null,
          errorMessage: error.message ?? null,
        }
      : {}),
    timestamp: Date.now(),
  });
}

export default function RemoteAudio({
  stream,
  remoteId,
  onSpeaking,
}: {
  stream: MediaStream;
  remoteId: string;
  onSpeaking?: (remoteId: string, level: number) => void;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const [blocked, setBlocked] = useState(false);

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

  const playAudio = useCallback(async () => {
    const el = ref.current;
    if (!el || !stream) return;

    try {
      el.muted = false;
      el.defaultMuted = false;
      el.volume = 1;

      await applyOutputDevice();
      await el.play();

      setBlocked(false);
      logRemoteAudioState(remoteId, el, stream, "play-success");
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      logRemoteAudioState(remoteId, el, stream, "play-failed", err);

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
  }, [remoteId, applyOutputDevice, stream]);

  const attachStream = useCallback(() => {
    const el = ref.current;
    if (!el || !stream) return;

    const track = stream.getAudioTracks()[0] ?? null;
    const trackId = track?.id ?? null;
    const trackChanged = trackId !== lastTrackIdRef.current;
    const needsAttach =
      trackChanged || el.srcObject !== stream || track?.readyState === "live";

    if (!needsAttach && el.srcObject === stream) {
      void playAudio();
      return;
    }

    if (isWindowsClient() && el.srcObject) {
      el.srcObject = null;
    }

    el.srcObject = stream;
    lastTrackIdRef.current = trackId;

    el.autoplay = true;
    el.setAttribute("playsinline", "true");
    el.volume = 1;
    el.muted = false;
    el.defaultMuted = false;

    logRemoteAudioState(remoteId, el, stream, trackChanged ? "attach-track-changed" : "attach");

    void playAudio();
  }, [playAudio, remoteId, stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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

    for (const track of stream.getAudioTracks()) {
      track.onunmute = () => {
        attachStream();
      };
    }

    const retryTimer = window.setTimeout(() => {
      attachStream();
    }, 300);

    return () => {
      window.clearTimeout(retryTimer);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("loadedmetadata", onCanPlay);
      stream.removeEventListener("addtrack", onAddTrack);
    };
  }, [attachStream, playAudio, stream]);

  useEffect(() => {
    return subscribeRemoteAudioUnlock(() => {
      void playAudio();
    });
  }, [playAudio]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void playAudio();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [playAudio]);

  useEffect(() => {
    if (isWindowsClient()) {
      return;
    }

    let raf = 0;
    let closed = false;
    let ctx: AudioContext | null = null;

    async function run() {
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
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

          if (level > 0.08) {
            onSpeaking?.(remoteId, level);
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
  }, [stream, remoteId, onSpeaking]);

  return (
    <>
      <audio
        ref={ref}
        data-remote={remoteId}
        autoPlay
        playsInline
        style={{ display: "none" }}
      />

      {blocked && (
        <button
          type="button"
          onClick={playAudio}
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
