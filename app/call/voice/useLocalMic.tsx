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

  const [micReady, setMicReady] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");

  // 🎧 デバイス一覧取得
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

  // 🎤 マイク取得（🔥ここが重要）
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        // 既存トラック停止
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
          track.enabled = !isMuted;
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

    // 🔥 ここが修正ポイント（条件なしで必ず実行）
    void init();

    return () => {
      mounted = false;

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      localAudioTrackRef.current = null;
    };
  }, [selectedMicId, deviceId]);

  // 🔇 ミュート制御
  useEffect(() => {
    const track = localAudioTrackRef.current;
    if (!track) return;

    track.enabled = !isMuted;
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