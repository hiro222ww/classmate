"use client";

import { useEffect, useRef, useState } from "react";

type UseLocalMicArgs = {
  deviceId: string;
  isMuted: boolean;
  onMicReadyChange?: (ready: boolean) => void;
  onMicLevelChange?: (level: number) => void;
  onStatusChange?: (text: string) => void;
};

export function useLocalMic({
  deviceId,
  isMuted,
  onMicReadyChange,
  onMicLevelChange,
  onStatusChange,
}: UseLocalMicArgs) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const onMicLevelChangeRef = useRef(onMicLevelChange);

  const [micReady, setMicReady] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");

  useEffect(() => {
    onMicLevelChangeRef.current = onMicLevelChange;
  }, [onMicLevelChange]);

  useEffect(() => {
    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");
        setAudioInputs(inputs);

        if (inputs.length > 0) {
          setSelectedMicId(inputs[0].deviceId);
        }
      } catch (e) {
        console.warn("[local-mic] enumerateDevices failed", e);
      }
    }

    void loadDevices();
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        localAudioTrackRef.current = null;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMicId
            ? {
                deviceId: { exact: selectedMicId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
          video: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const track = stream.getAudioTracks()[0] ?? null;

        if (track) {
          track.enabled = true;
        }

        localStreamRef.current = stream;
        localAudioTrackRef.current = track;

        console.log("[local-mic] ready", {
          hasTrack: !!track,
          label: track?.label ?? null,
          selectedMicId,
        });

        setMicReady(!!track);
        onMicReadyChange?.(!!track);
        onStatusChange?.("");
      } catch (e) {
        console.error("[local-mic] mic error", e);
        setMicReady(false);
        onMicReadyChange?.(false);
        onStatusChange?.("マイク取得に失敗");
      }
    }

    void init();

    return () => {
      mounted = false;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      localAudioTrackRef.current = null;
    };
  }, [selectedMicId, deviceId, onMicReadyChange, onStatusChange]);

  useEffect(() => {
    if (!micReady || !localStreamRef.current) return;

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

        const source = ctx.createMediaStreamSource(localStreamRef.current!);
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

          onMicLevelChangeRef.current?.(level);

          raf = requestAnimationFrame(tick);
        };

        tick();
      } catch (e) {
        console.error("[local-mic] meter error", e);
      }
    }

    void run();

    return () => {
      closed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ctx) void ctx.close().catch(() => {});
    };
  }, [micReady]);

  useEffect(() => {
    const track = localAudioTrackRef.current;
    if (!track) return;

    track.enabled = true;
  }, [isMuted]);

  return {
    micReady,
    audioInputs,
    selectedMicId,
    setSelectedMicId,
    localStreamRef,
    localAudioTrackRef,
  };
}