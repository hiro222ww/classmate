"use client";

type PeerMediaSnapshot = {
  remoteTracksCount: number;
  hasRemoteStream: boolean;
};

type PeerConnectionSnapshot = PeerMediaSnapshot & {
  connectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
  signalingState: RTCSignalingState | null;
  iceGatheringState: RTCIceGatheringState | null;
};

export function isVoiceLayerDebugEnabled() {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_VOICE_DEBUG === "true") return true;

  try {
    return localStorage.getItem("voice_debug") === "1";
  } catch {
    return false;
  }
}

export function voiceDebugLog(
  tag: string,
  payload: Record<string, unknown>
) {
  if (!isVoiceLayerDebugEnabled()) return;
  console.log(tag, { ...payload, timestamp: Date.now() });
}

function withBase(
  sessionId: string,
  localDeviceId: string,
  remoteDeviceId: string,
  extra?: Record<string, unknown>
) {
  return {
    sessionId,
    localDeviceId,
    remoteDeviceId,
    timestamp: Date.now(),
    ...extra,
  };
}

export function snapshotPeerConnection(
  pc: RTCPeerConnection | null | undefined,
  media: PeerMediaSnapshot
): PeerConnectionSnapshot {
  return {
    connectionState: pc?.connectionState ?? null,
    iceConnectionState: pc?.iceConnectionState ?? null,
    signalingState: pc?.signalingState ?? null,
    iceGatheringState: pc?.iceGatheringState ?? null,
    remoteTracksCount: media.remoteTracksCount,
    hasRemoteStream: media.hasRemoteStream,
  };
}

export function logPeerStateChange(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  field:
    | "connectionState"
    | "iceConnectionState"
    | "signalingState"
    | "iceGatheringState"
    | "remoteTracksCount"
    | "hasRemoteStream";
  previous: string | number | boolean | null;
  next: string | number | boolean | null;
  pc?: RTCPeerConnection | null;
  media?: PeerMediaSnapshot;
}) {
  console.log("[voice-peer] state-change", {
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    field: params.field,
    previous: params.previous,
    next: params.next,
    ...(params.pc && params.media
      ? snapshotPeerConnection(params.pc, params.media)
      : {}),
  });
}

export function logPeerStateWarning(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  reason:
    | "disconnected"
    | "failed"
    | "closed"
    | "checking_timeout"
    | "connecting_timeout";
  pc?: RTCPeerConnection | null;
  media: PeerMediaSnapshot;
}) {
  const snap = snapshotPeerConnection(params.pc, params.media);

  console.warn("[voice-peer] state-warning", {
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    reason: params.reason,
    ...snap,
  });
}

export function logRemoteTrackEvent(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  event: "ontrack" | "mute" | "unmute" | "ended";
  trackKind: string;
  trackId: string;
  elapsedMsSinceTrackEnded?: number;
  scheduledReconnectInMs?: number;
  reconnectScheduled?: boolean;
}) {
  console.log("[voice-peer] remote-track", {
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    event: params.event,
    trackKind: params.trackKind,
    trackId: params.trackId,
    ...(params.elapsedMsSinceTrackEnded != null
      ? { elapsedMsSinceTrackEnded: params.elapsedMsSinceTrackEnded }
      : {}),
    ...(params.scheduledReconnectInMs != null
      ? { scheduledReconnectInMs: params.scheduledReconnectInMs }
      : {}),
    ...(params.reconnectScheduled != null
      ? { reconnectScheduled: params.reconnectScheduled }
      : {}),
  });
}

export function logHealPeerAction(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  healRun: number;
  action: string;
  reason: string;
  pc?: RTCPeerConnection | null;
  media: PeerMediaSnapshot;
  scheduledInMs?: number;
  repeatWarning?: boolean;
}) {
  const snap = snapshotPeerConnection(params.pc, params.media);
  const payload = {
    healRun: params.healRun,
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    action: params.action,
    reason: params.reason,
    previousConnectionState: snap.connectionState,
    previousIceConnectionState: snap.iceConnectionState,
    previousSignalingState: snap.signalingState,
    remoteTracksCount: snap.remoteTracksCount,
    hasRemoteStream: snap.hasRemoteStream,
    ...(params.scheduledInMs != null
      ? { scheduledInMs: params.scheduledInMs }
      : {}),
  };

  if (params.repeatWarning) {
    console.warn("[voice-peer] healRun", payload);
  } else {
    console.log("[voice-peer] healRun", payload);
  }
}

export function logHealRecoverySuccess(params: {
  sessionId: string;
  localDeviceId: string;
  remoteDeviceId: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  remoteTracksCount: number;
  elapsedMs: number;
  recoveryVia?: "connected" | "ontrack" | "unmute";
  elapsedMsSinceTrackEnded?: number;
}) {
  console.log("[voice-peer] heal-recovered", {
    ...withBase(params.sessionId, params.localDeviceId, params.remoteDeviceId),
    remoteDeviceId: params.remoteDeviceId,
    connectionState: params.connectionState,
    iceConnectionState: params.iceConnectionState,
    remoteTracksCount: params.remoteTracksCount,
    elapsedMs: params.elapsedMs,
    ...(params.recoveryVia ? { recoveryVia: params.recoveryVia } : {}),
    ...(params.elapsedMsSinceTrackEnded != null
      ? { elapsedMsSinceTrackEnded: params.elapsedMsSinceTrackEnded }
      : {}),
  });
}

export function logCallLifecycle(
  event: string,
  params: {
    sessionId: string;
    deviceId: string;
    persisted?: boolean;
    visibilityState?: DocumentVisibilityState;
    extra?: Record<string, unknown>;
  }
) {
  console.log("[call-lifecycle]", {
    event,
    sessionId: params.sessionId,
    deviceId: params.deviceId,
    visibilityState:
      params.visibilityState ??
      (typeof document !== "undefined"
        ? document.visibilityState
        : undefined),
    ...(params.persisted != null ? { persisted: params.persisted } : {}),
    timestamp: Date.now(),
    ...params.extra,
  });
}

export function logCallNavigationType(params: {
  sessionId: string;
  deviceId: string;
}) {
  if (typeof performance === "undefined") return;

  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;

  console.log("[call-lifecycle] navigation", {
    type: entry?.type ?? "unknown",
    sessionId: params.sessionId,
    deviceId: params.deviceId,
    timestamp: Date.now(),
  });
}

function getNavigationTypeForDiagnostics(): string {
  if (typeof performance === "undefined") return "unknown";
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? "unknown";
}

export function installCallPageDiagnostics(params: {
  sessionId: string;
  deviceId: string;
}) {
  const { sessionId, deviceId } = params;

  const onError = (event: ErrorEvent) => {
    console.error("[call-lifecycle] window-error", {
      message: event.message,
      stack: event.error?.stack ?? null,
      timestamp: Date.now(),
      sessionId,
      deviceId,
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    console.error("[call-lifecycle] unhandled-rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : null,
      reason: reason instanceof Error ? reason.name : typeof reason,
      timestamp: Date.now(),
      sessionId,
      deviceId,
    });
  };

  const onPageHide = (event: PageTransitionEvent) => {
    logCallLifecycle("pagehide", {
      sessionId,
      deviceId,
      persisted: event.persisted,
    });
  };

  const onPageShow = (event: PageTransitionEvent) => {
    logCallLifecycle("pageshow", {
      sessionId,
      deviceId,
      persisted: event.persisted,
      extra: { navigationType: getNavigationTypeForDiagnostics() },
    });
  };

  const onVisibilityChange = () => {
    logCallLifecycle("visibilitychange", { sessionId, deviceId });
  };

  const onBeforeUnload = () => {
    logCallLifecycle("beforeunload", { sessionId, deviceId });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
