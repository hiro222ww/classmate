"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatVoiceModeSuffix } from "@/lib/voiceClientEnv";

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
  selectedMicId: string | null;
};

let activeMicCache: MicSessionCache | null = null;
let acquirePromise: Promise<boolean> | null = null;

function getNavigationType(): string {
  if (typeof performance === "undefined") return "unknown";
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? "unknown";
}

function getCurrentPath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

function captureCallerStack(): string | null {
  const err = new Error("releaseSessionMic caller");
  const lines = err.stack?.split("\n").slice(2, 8) ?? [];
  return lines.length > 0 ? lines.join("\n") : null;
}

function normalizeMicDeviceId(value?: string | null): string {
  return String(value ?? "").trim();
}

function micDeviceIdsMatch(
  trackDeviceId?: string | null,
  selectedMicId?: string | null
): boolean {
  const trackId = normalizeMicDeviceId(trackDeviceId);
  const selectedId = normalizeMicDeviceId(selectedMicId);
  if (!selectedId) return true;
  if (!trackId) return true;
  return trackId === selectedId;
}

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

function compactSessionId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 8) return value;
  return value.slice(-8);
}

function formatGetUserMediaAttemptLine(params: {
  reason: string;
  sessionId: string;
  previousCachedSessionId: string | null;
  selectedMicId?: string;
  userPickedMic: boolean;
  cacheHit: boolean;
  cacheMissReason: string | null;
  willCallGetUserMedia: boolean;
  navigationType: string;
}): string {
  return (
    `[local-mic] attempt reason=${params.reason} ` +
    `willCall=${compactBool(params.willCallGetUserMedia)} ` +
    `cacheHit=${compactBool(params.cacheHit)} ` +
    `cacheMiss=${params.cacheMissReason ?? "-"} ` +
    `nav=${params.navigationType} ` +
    `session=${compactSessionId(params.sessionId)} ` +
    `prev=${compactSessionId(params.previousCachedSessionId)} ` +
    `selected=${String(params.selectedMicId ?? "").trim() || "-"} ` +
    `userPicked=${compactBool(params.userPickedMic)} ` +
    formatVoiceModeSuffix()
  );
}

function compactBool(value: boolean): string {
  return value ? "true" : "false";
}

function logGetUserMediaAttempt(params: {
  reason: string;
  sessionId: string;
  previousCachedSessionId: string | null;
  deviceId: string;
  selectedMicId?: string;
  userPickedMic: boolean;
  hasExistingStream: boolean;
  existingAudioTrackReadyState: MediaStreamTrackState | null;
  cacheHit: boolean;
  cacheMissReason: string | null;
  willCallGetUserMedia: boolean;
}) {
  const navigationType = getNavigationType();

  console.log(
    formatGetUserMediaAttemptLine({
      reason: params.reason,
      sessionId: params.sessionId,
      previousCachedSessionId: params.previousCachedSessionId,
      selectedMicId: params.selectedMicId,
      userPickedMic: params.userPickedMic,
      cacheHit: params.cacheHit,
      cacheMissReason: params.cacheMissReason,
      willCallGetUserMedia: params.willCallGetUserMedia,
      navigationType,
    })
  );

  console.log("[local-mic] getUserMedia attempt", {
    reason: params.reason,
    cacheHit: params.cacheHit,
    cacheMissReason: params.cacheMissReason,
    navigationType,
    sessionId: params.sessionId,
    previousCachedSessionId: params.previousCachedSessionId,
    selectedMicId: params.selectedMicId ?? "",
    userPickedMic: params.userPickedMic,
    deviceId: params.deviceId,
    hasExistingStream: params.hasExistingStream,
    existingAudioTrackReadyState: params.existingAudioTrackReadyState,
    willCallGetUserMedia: params.willCallGetUserMedia,
    currentPath: getCurrentPath(),
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
  cacheHit?: boolean;
}) {
  if (params.ok) {
    console.log("[local-mic] getUserMedia success", {
      reason: params.reason,
      sessionId: params.sessionId,
      deviceId: params.deviceId,
      reused: params.reused === true,
      cacheHit: params.cacheHit === true,
      trackLabel: params.trackLabel ?? null,
      navigationType: getNavigationType(),
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
    navigationType: getNavigationType(),
    timestamp: Date.now(),
  });
}

function logEffectRun(params: {
  effect: string;
  sessionId: string;
  deviceId: string;
  selectedMicId: string;
  depsChanged: string[];
  hasCache: boolean;
  trackReadyState: MediaStreamTrackState | null;
}) {
  console.log("[local-mic] effect", {
    ...params,
    navigationType: getNavigationType(),
    cachedSessionId: activeMicCache?.sessionId ?? null,
    timestamp: Date.now(),
  });
}

export function releaseSessionMic(reason: string, sessionId?: string) {
  const cachedSessionId = activeMicCache?.sessionId ?? null;
  const trackReadyState = activeMicCache?.track.readyState ?? null;

  if (!activeMicCache) {
    console.log("[local-mic] release skipped (no cache)", {
      reason,
      sessionId: sessionId ?? null,
      cachedSessionId,
      currentPath: getCurrentPath(),
      caller: captureCallerStack(),
      trackReadyState,
      timestamp: Date.now(),
    });
    return;
  }

  if (sessionId && activeMicCache.sessionId !== sessionId) {
    console.log("[local-mic] release skipped (session mismatch)", {
      reason,
      sessionId,
      cachedSessionId,
      currentPath: getCurrentPath(),
      caller: captureCallerStack(),
      trackReadyState,
      timestamp: Date.now(),
    });
    return;
  }

  console.log("[local-mic] release", {
    reason,
    sessionId: cachedSessionId,
    cachedSessionId,
    currentPath: getCurrentPath(),
    caller: captureCallerStack(),
    trackReadyState,
    timestamp: Date.now(),
  });

  activeMicCache.stream.getTracks().forEach((track) => track.stop());
  activeMicCache = null;
}

function getCachedMic(
  sessionId: string,
  selectedMicId?: string
): { cache: MicSessionCache | null; missReason: string | null } {
  if (!activeMicCache) {
    return { cache: null, missReason: "no_active_cache" };
  }

  if (activeMicCache.sessionId !== sessionId) {
    return {
      cache: null,
      missReason: `session_mismatch:${activeMicCache.sessionId}->${sessionId}`,
    };
  }

  if (!isAudioTrackUsable(activeMicCache.track)) {
    releaseSessionMic("cached_track_not_live", sessionId);
    return { cache: null, missReason: "cached_track_not_live" };
  }

  if (
    selectedMicId &&
    activeMicCache.selectedMicId &&
    !micDeviceIdsMatch(activeMicCache.selectedMicId, selectedMicId)
  ) {
    return { cache: null, missReason: "selected_mic_changed" };
  }

  return { cache: activeMicCache, missReason: null };
}

function setMicCache(
  sessionId: string,
  stream: MediaStream,
  track: MediaStreamTrack,
  selectedMicId?: string
) {
  if (activeMicCache && activeMicCache.sessionId !== sessionId) {
    releaseSessionMic("session_changed", activeMicCache.sessionId);
  }

  activeMicCache = {
    sessionId,
    stream,
    track,
    acquiredAt: Date.now(),
    selectedMicId: normalizeMicDeviceId(selectedMicId || track.getSettings().deviceId) || null,
  };
}

async function ensureLocalMicStream(params: {
  reason: string;
  sessionId: string;
  deviceId: string;
  selectedMicId?: string;
  userPickedMic?: boolean;
  onMicReadyChange?: (ready: boolean) => void;
  onStatusChange?: (text: string) => void;
  streamRef: React.MutableRefObject<MediaStream | null>;
  trackRef: React.MutableRefObject<MediaStreamTrack | null>;
  showInitialPermissionHint?: boolean;
}): Promise<boolean> {
  if (acquirePromise) {
    console.log("[local-mic] ensure deduped (in-flight acquire)", {
      reason: params.reason,
      sessionId: params.sessionId,
      timestamp: Date.now(),
    });
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
      userPickedMic = false,
    } = params;

    const previousCachedSessionId = activeMicCache?.sessionId ?? null;
    const { cache: cached, missReason } = getCachedMic(sessionId, selectedMicId);

    if (cached) {
      streamRef.current = cached.stream;
      trackRef.current = cached.track;
      cached.track.enabled = true;
      onMicReadyChange?.(true);
      onStatusChange?.("");
      logGetUserMediaAttempt({
        reason,
        sessionId,
        previousCachedSessionId,
        deviceId,
        selectedMicId,
        userPickedMic,
        hasExistingStream: true,
        existingAudioTrackReadyState: cached.track.readyState,
        cacheHit: true,
        cacheMissReason: null,
        willCallGetUserMedia: false,
      });
      logGetUserMediaResult({
        ok: true,
        reason,
        sessionId,
        deviceId,
        reused: true,
        cacheHit: true,
        trackLabel: cached.track.label,
      });
      return true;
    }

    const existingStream = streamRef.current;
    const existingTrack = trackRef.current;

    if (
      isAudioTrackUsable(existingTrack) &&
      existingStream &&
      micDeviceIdsMatch(existingTrack!.getSettings().deviceId, selectedMicId)
    ) {
      setMicCache(sessionId, existingStream, existingTrack!, selectedMicId);
      onMicReadyChange?.(true);
      onStatusChange?.("");
      logGetUserMediaAttempt({
        reason,
        sessionId,
        previousCachedSessionId,
        deviceId,
        selectedMicId,
        userPickedMic,
        hasExistingStream: true,
        existingAudioTrackReadyState: existingTrack!.readyState,
        cacheHit: false,
        cacheMissReason: missReason ?? "ref_reuse",
        willCallGetUserMedia: false,
      });
      logGetUserMediaResult({
        ok: true,
        reason,
        sessionId,
        deviceId,
        reused: true,
        cacheHit: false,
        trackLabel: existingTrack!.label,
      });
      return true;
    }

    logGetUserMediaAttempt({
      reason,
      sessionId,
      previousCachedSessionId,
      deviceId,
      selectedMicId,
      userPickedMic,
      hasExistingStream: !!existingStream,
      existingAudioTrackReadyState: existingTrack?.readyState ?? null,
      cacheHit: false,
      cacheMissReason: missReason,
      willCallGetUserMedia: true,
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
      setMicCache(sessionId, stream, track, selectedMicId);

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
  const userPickedMicRef = useRef(false);
  const prevSessionMountDepsRef = useRef<{ sessionId: string }>({
    sessionId: "",
  });
  const prevMicSelectDepsRef = useRef<{
    sessionId: string;
    selectedMicId: string;
  }>({ sessionId: "", selectedMicId: "" });

  const [micReady, setMicReady] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicIdState] = useState("");

  const syncSelectedMicFromTrack = useCallback((track?: MediaStreamTrack | null) => {
    const resolved = normalizeMicDeviceId(track?.getSettings().deviceId);
    if (!resolved) return;
    selectedMicIdRef.current = resolved;
    setSelectedMicIdState((prev) => (prev === resolved ? prev : resolved));
  }, []);

  const setSelectedMicId = useCallback((next: string) => {
    userPickedMicRef.current = true;
    const normalized = normalizeMicDeviceId(next);
    selectedMicIdRef.current = normalized;
    setSelectedMicIdState(normalized);
  }, []);

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

    const depsChanged: string[] = [];
    if (prevSessionMountDepsRef.current.sessionId !== sessionId) {
      depsChanged.push("sessionId");
    }

    logEffectRun({
      effect: "session_mount",
      sessionId,
      deviceId,
      selectedMicId: selectedMicIdRef.current,
      depsChanged,
      hasCache: !!getCachedMic(sessionId).cache,
      trackReadyState: localAudioTrackRef.current?.readyState ?? null,
    });

    prevSessionMountDepsRef.current = { sessionId };

    let mounted = true;

    void (async () => {
      const showHint =
        !initialHintShownRef.current && !getCachedMic(sessionId).cache;
      if (showHint) {
        initialHintShownRef.current = true;
      }

      const ok = await ensureLocalMicStream({
        reason: "session_mount",
        sessionId,
        deviceId,
        userPickedMic: false,
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

      syncSelectedMicFromTrack(localAudioTrackRef.current);

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === "audioinput");
        setAudioInputs(inputs);
      } catch (e) {
        console.warn("[local-mic] enumerateDevices after grant failed", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [sessionId, bindReadyState, deviceId, syncSelectedMicFromTrack]);

  useEffect(() => {
    if (!sessionId || !selectedMicId) return;
    if (!userPickedMicRef.current) return;

    const depsChanged: string[] = [];
    if (prevMicSelectDepsRef.current.sessionId !== sessionId) {
      depsChanged.push("sessionId");
    }
    if (prevMicSelectDepsRef.current.selectedMicId !== selectedMicId) {
      depsChanged.push("selectedMicId");
    }

    logEffectRun({
      effect: "mic_device_selected",
      sessionId,
      deviceId,
      selectedMicId,
      depsChanged,
      hasCache: !!getCachedMic(sessionId, selectedMicId).cache,
      trackReadyState: localAudioTrackRef.current?.readyState ?? null,
    });

    prevMicSelectDepsRef.current = { sessionId, selectedMicId };

    const track = localAudioTrackRef.current;
    if (
      track &&
      isAudioTrackUsable(track) &&
      micDeviceIdsMatch(track.getSettings().deviceId, selectedMicId)
    ) {
      userPickedMicRef.current = false;
      return;
    }

    userPickedMicRef.current = false;

    void ensureLocalMicStream({
      reason: "mic_device_selected",
      sessionId,
      deviceId,
      userPickedMic: true,
      selectedMicId,
      onMicReadyChange: bindReadyState,
      onStatusChange: (text) => onStatusChangeRef.current?.(text),
      streamRef: localStreamRef,
      trackRef: localAudioTrackRef,
    }).then((ok) => {
      if (ok) {
        syncSelectedMicFromTrack(localAudioTrackRef.current);
      }
    });
  }, [selectedMicId, sessionId, deviceId, bindReadyState, syncSelectedMicFromTrack]);

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
