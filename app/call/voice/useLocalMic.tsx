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

  useEffect(() => {
    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");

        setAudioInputs(inputs);
        setSelectedMicId(inputs[0]?.deviceId || "");
      } catch (e) {
        console.warn("[call] load audio devices failed", e);
      }
    }

    loadDevices();
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
        });

        const track = stream.getAudioTracks()[0] ?? null;

        localStreamRef.current = stream;
        localAudioTrackRef.current = track;

        setMicReady(!!track);
        onMicReadyChange?.(!!track);
        onStatusChange?.("");
      } catch (e) {
        console.error("[call] mic error", e);
        setMicReady(false);
        onMicReadyChange?.(false);
        onStatusChange?.("マイク取得に失敗");
      }
    }

    if (selectedMicId !== "") {
      init();
    }
  }, [selectedMicId, deviceId]);

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