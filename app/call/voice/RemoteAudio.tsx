"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function callWarn(...args: any[]) {
  console.warn(...args);
}

function callError(...args: any[]) {
  console.error(...args);
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
  const lastStreamRef = useRef<MediaStream | null>(null);
  const [blocked, setBlocked] = useState(false);

  const applyOutputDevice = useCallback(async () => {
    const el = ref.current;
    if (!el) return;

    const sinkId = localStorage.getItem("audio_output_device");
    if (!sinkId) return;

    if ("setSinkId" in el) {
      try {
        await (el as any).setSinkId(sinkId);
        console.log("[call] output device applied", { remoteId, sinkId });
      } catch (e) {
        callWarn("[call] setSinkId failed", { remoteId, sinkId, e });
      }
    }
  }, [remoteId]);

  const playAudio = useCallback(async () => {
    const el = ref.current;
    if (!el) return;

    try {
      el.muted = false;
      el.defaultMuted = false;
      el.volume = 1;

      await applyOutputDevice();
      await el.play();

      setBlocked(false);
    } catch (e: any) {
      if (e?.name === "NotAllowedError") {
        setBlocked(true);
        callWarn("[call] autoplay blocked", remoteId);
        return;
      }

      if (e?.name === "AbortError") {
        callWarn("[call] remote audio play aborted", remoteId);
        return;
      }

      callError("[call] remote audio play error", remoteId, e);
    }
  }, [remoteId, applyOutputDevice]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (lastStreamRef.current !== stream || el.srcObject !== stream) {
      el.srcObject = stream;
      lastStreamRef.current = stream;
    }

    el.autoplay = true;
    el.setAttribute("playsinline", "true");
    el.volume = 1;
    el.muted = false;
    el.defaultMuted = false;

    const tryPlay = () => {
      void playAudio();
    };

    el.addEventListener("canplay", tryPlay);
    el.addEventListener("loadedmetadata", tryPlay);

    void playAudio();

    const retryTimer = window.setTimeout(() => {
      void playAudio();
    }, 300);

    return () => {
      window.clearTimeout(retryTimer);
      el.removeEventListener("canplay", tryPlay);
      el.removeEventListener("loadedmetadata", tryPlay);
    };
  }, [stream, playAudio]);

  useEffect(() => {
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