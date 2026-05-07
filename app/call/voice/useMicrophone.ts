import { useEffect, useRef, useState } from "react";
import { callError, callLog, callWarn } from "./debug";

type UseMicrophoneParams = {
  deviceId?: string;
  isMuted: boolean;
  onMicReadyChange?: (ready: boolean) => void;
  onMicLevelChange?: (level: number) => void;
  onStatusChange?: (text: string) => void;
};

export function useMicrophone({
  deviceId,
  isMuted,
  onMicReadyChange,
  onMicLevelChange,
  onStatusChange,
}: UseMicrophoneParams) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [micReady, setMicReady] = useState(false);
  const [micStreamVersion, setMicStreamVersion] = useState(0);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");

  useEffect(() => {
    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");

        setAudioInputs(inputs);

        const nonVirtual = inputs.find((d) => {
          const label = d.label?.toLowerCase() ?? "";
          return (
            label &&
            !label.includes("steam") &&
            !label.includes("virtual") &&
            !label.includes("obs") &&
            !label.includes("discord")
          );
        });

        if (nonVirtual) setSelectedMicId(nonVirtual.deviceId);
        else if (inputs[0]) setSelectedMicId(inputs[0].deviceId);
      } catch (e) {
        callWarn("[call] load audio devices failed", e);
      }
    }

    void loadDevices();
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
          localAudioTrackRef.current = null;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
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

        localStreamRef.current = stream;
        localAudioTrackRef.current = stream.getAudioTracks()[0] ?? null;
        setMicStreamVersion((v) => v + 1);

        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.enabled = true;
        }

        callLog("[call] local audio track", {
          deviceId,
          trackId: localAudioTrackRef.current?.id ?? null,
          label: localAudioTrackRef.current?.label ?? null,
          enabled: localAudioTrackRef.current?.enabled ?? null,
          muted: isMuted,
        });

        setMicReady(true);
        onMicReadyChange?.(true);
        onStatusChange?.("");
      } catch (e) {
        callError("[call] mic error", e);
        setMicReady(false);
        onMicReadyChange?.(false);
        onStatusChange?.("マイク取得に失敗");
      }
    }

    void init();

    return () => {
      mounted = false;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      localAudioTrackRef.current = null;
    };
  }, [selectedMicId, deviceId, isMuted, onMicReadyChange, onStatusChange]);

  useEffect(() => {
    if (!micReady) return;
    if (!localStreamRef.current) return;

    let raf = 0;
    let closed = false;
    let ctx: AudioContext | null = null;

    async function run() {
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;

        ctx = new Ctx();
        audioCtxRef.current = ctx;

        if (ctx.state === "suspended") {
          await ctx.resume().catch(() => {});
        }

        const source = ctx.createMediaStreamSource(
          localStreamRef.current as MediaStream
        );
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

          onMicLevelChange?.(level);
          raf = requestAnimationFrame(tick);
        };

        void tick();
      } catch (e) {
        callError("[call] meter error", e);
      }
    }

    void run();

    return () => {
      closed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ctx) void ctx.close().catch(() => {});
      if (audioCtxRef.current === ctx) audioCtxRef.current = null;
    };
  }, [micReady, micStreamVersion, onMicLevelChange]);

  return {
    micReady,
    micStreamVersion,
    audioInputs,
    selectedMicId,
    setSelectedMicId,
    localStreamRef,
    localAudioTrackRef,
  };
}