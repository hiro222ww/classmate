"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseLocalMicArgs = {
  sessionId: string;
  deviceId: string;
  isMuted: boolean;
  onMicReadyChange?: (ready: boolean) => void;
  onMicLevelChange?: (level: number) => void;
  onStatusChange?: (text: string) => void;
};

type MicSessionCache = {
  sessionId: string;
  stream: MediaStream;
  track: MediaStreamTrack;
  acquiredAt: number;
};

let activeMicCache: MicSessionCache | null = null;
let acquirePromise: Promise<boolean> | null = null;

function isAudioTrackUsable(track: MediaStreamTrack | null | undefined): boolean {
  if (!track) return false;
  return track.readyState === "live";
}

function getMicErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "マイクが見つかりません。接続を確認してください。";
  }
  return "マイク取得に失敗しました。";
}

function logGetUserMediaAttempt(params: {
  reason: string;
  hasExistingStream: boolean;
  existingAudioTrackReadyState: MediaStreamTrackState | null;
  sessionId: string;
  deviceId: string;
  selectedMicId?: string;
}) {
  console.log("[local-mic] getUserMedia attempt", {
    ...params,
    timestamp: Date.now(),
  });
}

function logGetUserMediaResult(params: {
  ok: boolean;
  reason: string;
  sessionId: string;
  deviceId: string;
  error?: unknown;
  trackLabel?: string | null;
  reused?: boolean;
}) {
  if (params.ok) {
    console.log("[local-mic] getUserMedia success", {
      reason: params.reason,
      sessionId: params.sessionId,
      deviceId: params.deviceId,
      reused: params.reused === true,
      trackLabel: params.trackLabel ?? null,
      timestamp: Date.now(),
    });
    return;
  }

  console.error("[local-mic] getUserMedia failed", {
    reason: params.reason,
    sessionId: params.sessionId,
    deviceId: params.deviceId,
    error:
      params.error instanceof DOMException
        ? { name: params.error.name, message: params.error.message }
        : params.error,
    timestamp: Date.now(),
  });
}

export function releaseSessionMic(reason: string, sessionId?: string) {
  if (!activeMicCache) {
    console.log("[local-mic] release skipped (no cache)", {
      reason,
      sessionId: sessionId ?? null,
      timestamp: Date.now(),
    });
    return;
  }

  if (sessionId && activeMicCache.sessionId !== sessionId) {
    console.log("[local-mic] release skipped (session mismatch)", {
      reason,
      requestedSessionId: sessionId,
      cachedSessionId: activeMicCache.sessionId,
      timestamp: Date.now(),
    });
    return;
  }

  console.log("[local-mic] release", {
    reason,
    sessionId: activeMicCache.sessionId,
    trackReadyState: activeMicCache.track.readyState,
    timestamp: Date.now(),
  });

  activeMicCache.stream.getTracks().forEach((track) => track.stop());
  activeMicCache = null;
}

function getCachedMic(sessionId: string): MicSessionCache | null {
  if (!activeMicCache) return null;
  if (activeMicCache.sessionId !== sessionId) return null;

  if (!isAudioTrackUsable(activeMicCache.track)) {
    releaseSessionMic("cached_track_not_live", sessionId);
    return null;
  }

  return activeMicCache;
}

function setMicCache(sessionId: string, stream: MediaStream, track: MediaStreamTrack) {
  if (activeMicCache && activeMicCache.sessionId !== sessionId) {
    releaseSessionMic("session_changed", activeMicCache.sessionId);
  }

  activeMicCache = {
    sessionId,
    stream,
    track,
    acquiredAt: Date.now(),
  };
}

async function ensureLocalMicStream(params: {
  reason: string;
  sessionId: string;
  deviceId: string;
  selectedMicId?: string;
  onMicReadyChange?: (ready: boolean) => void;
  onStatusChange?: (text: string) => void;
  streamRef: React.MutableRefObject<MediaStream | null>;
  trackRef: React.MutableRefObject<MediaStreamTrack | null>;
  showInitialPermissionHint?: boolean;
}): Promise<boolean> {
  if (acquirePromise) {
    return acquirePromise;
  }

  acquirePromise = (async () => {
    const {
      reason,
      sessionId,
      deviceId,
      selectedMicId,
      onMicReadyChange,
      onStatusChange,
      streamRef,
      trackRef,
      showInitialPermissionHint = false,
    } = params;

    const cached = getCachedMic(sessionId);
    if (cached) {
      streamRef.current = cached.stream;
      trackRef.current = cached.track;
      cached.track.enabled = true;
      onMicReadyChange?.(true);
      onStatusChange?.("");
      logGetUserMediaResult({
        ok: true,
        reason,
        sessionId,
        deviceId,
        reused: true,
        trackLabel: cached.track.label,
      });
      return true;
    }

    const existingStream = streamRef.current;
    const existingTrack = trackRef.current;

    if (isAudioTrackUsable(existingTrack) && existingStream) {
      const currentDeviceId = existingTrack!.getSettings().deviceId;
      if (!selectedMicId || !currentDeviceId || currentDeviceId === selectedMicId) {
        setMicCache(sessionId, existingStream, existingTrack!);
        onMicReadyChange?.(true);
        onStatusChange?.("");
        logGetUserMediaResult({
          ok: true,
          reason,
          sessionId,
          deviceId,
          reused: true,
          trackLabel: existingTrack!.label,
        });
        return true;
      }
    }

    logGetUserMediaAttempt({
      reason,
      hasExistingStream: !!existingStream,
      existingAudioTrackReadyState: existingTrack?.readyState ?? null,
      sessionId,
      deviceId,
      selectedMicId,
    });

    if (showInitialPermissionHint) {
      onStatusChange?.("マイクの使用を許可してください");
    }

    try {
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

      const track = stream.getAudioTracks()[0] ?? null;
      if (!track) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("no_audio_track");
      }

      if (existingStream && existingStream !== stream) {
        existingStream.getTracks().forEach((t) => t.stop());
      }

      track.enabled = true;
      streamRef.current = stream;
      trackRef.current = track;
      setMicCache(sessionId, stream, track);

      onMicReadyChange?.(true);
      onStatusChange?.("");

      logGetUserMediaResult({
        ok: true,
        reason,
        sessionId,
        deviceId,
        trackLabel: track.label,
      });

      return true;
    } catch (error) {
      onMicReadyChange?.(false);
      onStatusChange?.(getMicErrorMessage(error));
      logGetUserMediaResult({
        ok: false,
        reason,
        sessionId,
        deviceId,
        error,
      });
      return false;
    }
  })();

  try {
    return await acquirePromise;
  } finally {
    acquirePromise = null;
  }
}

export function useLocalMic({
  sessionId,
  deviceId,
  isMuted,
  onMicReadyChange,
  onMicLevelChange,
  onStatusChange,
}: UseLocalMicArgs) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const onMicReadyChangeRef = useRef(onMicReadyChange);
  const onMicLevelChangeRef = useRef(onMicLevelChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const selectedMicIdRef = useRef("");
  const initialHintShownRef = useRef(false);

  const [micReady, setMicReady] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");

  useEffect(() => {
    onMicReadyChangeRef.current = onMicReadyChange;
  }, [onMicReadyChange]);

  useEffect(() => {
    onMicLevelChangeRef.current = onMicLevelChange;
  }, [onMicLevelChange]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    selectedMicIdRef.current = selectedMicId;
  }, [selectedMicId]);

  useEffect(() => {
    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");
        setAudioInputs(inputs);

        if (inputs.length > 0 && !selectedMicIdRef.current) {
          setSelectedMicId(inputs[0].deviceId);
        }
      } catch (e) {
        console.warn("[local-mic] enumerateDevices failed", e);
      }
    }

    void loadDevices();
  }, []);

  const bindReadyState = useCallback((ready: boolean) => {
    setMicReady(ready);
    onMicReadyChangeRef.current?.(ready);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    let mounted = true;

    void (async () => {
      const showHint =
        !initialHintShownRef.current && !getCachedMic(sessionId);
      if (showHint) {
        initialHintShownRef.current = true;
      }

      const ok = await ensureLocalMicStream({
        reason: "session_mount",
        sessionId,
        deviceId,
        selectedMicId: selectedMicIdRef.current || undefined,
        onMicReadyChange: (ready) => {
          if (!mounted) return;
          bindReadyState(ready);
        },
        onStatusChange: (text) => {
          if (!mounted) return;
          onStatusChangeRef.current?.(text);
        },
        streamRef: localStreamRef,
        trackRef: localAudioTrackRef,
        showInitialPermissionHint: showHint,
      });

      if (!mounted || !ok) return;

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");
        setAudioInputs(inputs);
        if (inputs.length > 0 && !selectedMicIdRef.current) {
          setSelectedMicId(inputs[0].deviceId);
        }
      } catch (e) {
        console.warn("[local-mic] enumerateDevices after grant failed", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [sessionId, bindReadyState, deviceId]);

  useEffect(() => {
    if (!sessionId || !selectedMicId) return;

    const track = localAudioTrackRef.current;
    if (!track && !micReady) return;

    const currentDeviceId = track?.getSettings().deviceId;
    if (track && isAudioTrackUsable(track) && currentDeviceId === selectedMicId) {
      return;
    }

    void ensureLocalMicStream({
      reason: "mic_device_selected",
      sessionId,
      deviceId,
      selectedMicId,
      onMicReadyChange: bindReadyState,
      onStatusChange: (text) => onStatusChangeRef.current?.(text),
      streamRef: localStreamRef,
      trackRef: localAudioTrackRef,
    });
  }, [selectedMicId, sessionId, deviceId, bindReadyState, micReady]);

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
