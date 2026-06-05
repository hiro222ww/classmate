import { debugConsoleLog } from "@/lib/debugVoiceLog";
import {
  resolveMemberParticipationForUi,
  sanitizePresenceForUi,
  type InternalMemberStatus,
  type UnifiedMemberStatus,
} from "@/lib/memberStatus";
import { isStableVoiceJoinMode } from "@/lib/stableVoiceJoin";

export type UiParticipationStatus = "in_call" | "waiting" | "offline";

export type CallPeerState = "idle" | "connecting" | "connected" | "failed";

export type EffectivePeerState = CallPeerState | "connected_effective";

export const PLAYBACK_EFFECTIVE_CONNECTED_MS = 15_000;
export const MANUAL_AUDIO_RECONNECT_UNCONFIRMED_MS = 15_000;
export const RECENT_REMOTE_SIGNAL_MS = 10_000;
export const REMOTE_AUDIO_PLAY_SUCCESS_RECENT_MS = 15_000;
export const REMOTE_AUDIO_UNSTABLE_MS = 15_000;
export const RECONNECT_BUTTON_STALL_MS = 15_000;
export const UI_RECONNECT_BUTTON_MIN_UNHEALTHY_MS = 17_000;
export const UI_LABEL_CONFIRMING_DELAY_MS = 2500;
export const UI_LABEL_DOWNGRADE_FROM_CONNECTED_MS = 5000;
export const REMOTE_AUDIO_LEVEL_ACTIVE_THRESHOLD = 0.02;

const STABLE_CONNECTED_LABELS = new Set(["接続済み", "音声受信中"]);
const SOFTER_DOWNGRADE_LABELS = new Set([
  "音声確認中",
  "接続処理中",
  "再接続中",
]);

export type RemoteAudioHealthInput = {
  playSuccess?: boolean;
  lastPlaySuccessAt?: number | null;
  currentTimeAdvanced?: boolean;
  level?: number;
  trackReady?: string;
  playFailedAt?: number | null;
  lastAttachAt?: number | null;
  verified?: boolean;
  playbackActive?: boolean;
  playbackActiveMode?: PlaybackActiveMode;
  audioActuallyPlaying?: boolean;
};

export function isRecentPlaySuccess(
  lastPlaySuccessAt: number | null | undefined,
  nowMs: number,
  windowMs = REMOTE_AUDIO_PLAY_SUCCESS_RECENT_MS
): boolean {
  return (
    lastPlaySuccessAt != null && nowMs - lastPlaySuccessAt < windowMs
  );
}

export function hasRecentRemoteAudioSignals(params: {
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
  lastPlaySuccessAt?: number | null;
  nowMs: number;
  windowMs?: number;
}): boolean {
  const windowMs = params.windowMs ?? RECENT_REMOTE_SIGNAL_MS;
  const anchors = [
    params.lastOnTrackAt,
    params.lastUnmuteAt,
    params.lastPlaySuccessAt,
  ].filter((value): value is number => value != null);

  return anchors.some((at) => params.nowMs - at < windowMs);
}

export function isTransportMediaConnected(conn: string, ice: string): boolean {
  return (
    conn === "connected" || ice === "connected" || ice === "completed"
  );
}

export const TRANSPORT_UNCONFIRMED_MS_DEFAULT = 17_000;
export const TRANSPORT_UNCONFIRMED_MS_IOS = 10_000;

export function isPeerP2pEstablished(params: {
  conn: string;
  ice: string;
  lastPlaybackConfirmedAt?: number | null;
  trackReady: string;
  lastPlaybackActiveAt?: number | null;
  lastPlaySuccessAt?: number | null;
  audioActuallyPlaying?: boolean;
  nowMs?: number;
}): boolean {
  if (params.trackReady !== "live") return false;
  if (params.lastPlaybackConfirmedAt == null) return false;
  if (params.conn !== "connected") return false;
  if (params.ice !== "connected" && params.ice !== "completed") return false;

  if (params.audioActuallyPlaying === true) return true;

  const now = params.nowMs ?? Date.now();
  const playbackActive =
    params.lastPlaybackActiveAt != null &&
    now - params.lastPlaybackActiveAt < PLAYBACK_EFFECTIVE_CONNECTED_MS;
  const playSuccess = isRecentPlaySuccess(params.lastPlaySuccessAt, now);
  return playbackActive || playSuccess;
}

export function isPeerTransportUnconfirmed(params: {
  conn: string;
  ice: string;
  lastPlaybackConfirmedAt?: number | null;
  lastPlaySuccessAt?: number | null;
  iceCheckingStuckSince?: number | null;
  nowMs?: number;
  voiceMode?: string;
}): boolean {
  const ice = params.ice;
  const conn = params.conn;
  const transportPending =
    ice === "checking" ||
    conn === "connecting" ||
    (ice === "disconnected" && conn === "connecting");
  if (!transportPending) return false;
  if (params.lastPlaybackConfirmedAt != null) return false;
  if (params.lastPlaySuccessAt == null) return false;

  const now = params.nowMs ?? Date.now();
  const threshold =
    params.voiceMode === "ios_conservative"
      ? TRANSPORT_UNCONFIRMED_MS_IOS
      : TRANSPORT_UNCONFIRMED_MS_DEFAULT;
  const stuckSince =
    params.iceCheckingStuckSince ?? params.lastPlaySuccessAt;
  return now - stuckSince >= threshold;
}

export function isStalePlayFailure(
  health: RemoteAudioHealthInput | null | undefined,
  nowMs: number
): boolean {
  if (!health?.playFailedAt) return false;
  if (
    health.lastPlaySuccessAt != null &&
    health.lastPlaySuccessAt >= health.playFailedAt
  ) {
    return false;
  }
  return nowMs - health.playFailedAt < REMOTE_AUDIO_UNSTABLE_MS;
}

const REMOTE_AUDIO_LABEL_STYLE = {
  connected: {
    color: "#065f46",
    chipBg: "#ecfdf5",
    chipText: "#047857",
  },
  receiving: {
    color: "#065f46",
    chipBg: "#ecfdf5",
    chipText: "#047857",
  },
  confirming: {
    color: "#92400e",
    chipBg: "#fffbeb",
    chipText: "#b45309",
  },
  processing: {
    color: "#92400e",
    chipBg: "#fffbeb",
    chipText: "#b45309",
  },
  unstable: {
    color: "#991b1b",
    chipBg: "#fef2f2",
    chipText: "#dc2626",
  },
  waiting: {
    color: "#6b7280",
    chipBg: "#f3f4f6",
    chipText: "#6b7280",
  },
} as const;

/** ontrack/unmute 後、play-success 前の短い確認ウィンドウ（内部判定） */
export function isPrePlaySuccessConfirming(params: {
  hasRemoteStream: boolean;
  trackReady: string;
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
  lastPlaySuccessAt?: number | null;
  nowMs: number;
}): boolean {
  if (!params.hasRemoteStream || params.trackReady !== "live") return false;
  if (isRecentPlaySuccess(params.lastPlaySuccessAt, params.nowMs)) return false;

  const anchors = [params.lastOnTrackAt, params.lastUnmuteAt].filter(
    (value): value is number => value != null
  );
  if (!anchors.length) return false;

  const latest = Math.max(...anchors);
  return params.nowMs - latest < RECENT_REMOTE_SIGNAL_MS;
}

/** UI に「音声確認中」を出すか（短い揺れは抑止） */
export function shouldShowPrePlayConfirmingLabel(params: {
  hasRemoteStream: boolean;
  trackReady: string;
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
  lastPlaySuccessAt?: number | null;
  nowMs: number;
}): boolean {
  if (!isPrePlaySuccessConfirming(params)) return false;
  const anchors = [params.lastOnTrackAt, params.lastUnmuteAt].filter(
    (value): value is number => value != null
  );
  if (!anchors.length) return false;
  const latest = Math.max(...anchors);
  return params.nowMs - latest >= UI_LABEL_CONFIRMING_DELAY_MS;
}

export type PeerLabelHysteresisState = {
  displayedText: string;
  displayedReason: string;
  stableConnectedSinceMs: number | null;
  pendingDowngradeText: string | null;
  pendingDowngradeSinceMs: number | null;
};

export function logUiLabelHold(params: {
  remoteDeviceId: string;
  previous: string;
  candidate: string;
  reason: string;
}) {
  debugConsoleLog(
    `[call-status-peer] ui-label-hold remote=${params.remoteDeviceId.slice(-4)} ` +
      `previous=${params.previous} candidate=${params.candidate} reason=${params.reason}`
  );
}

export function applyCallMemberStatusHysteresis(params: {
  remoteDeviceId: string;
  candidate: {
    text: string;
    color: string;
    chipBg: string;
    chipText: string;
    reason: string;
    source: string;
    statusSource?: string;
  };
  previous: PeerLabelHysteresisState | null;
  nowMs: number;
  isMe: boolean;
  recentPlaySuccess: boolean;
  audioActuallyPlaying: boolean;
  playbackActive: boolean;
}): {
  status: typeof params.candidate;
  state: PeerLabelHysteresisState;
} {
  if (params.isMe) {
    return {
      status: params.candidate,
      state: {
        displayedText: params.candidate.text,
        displayedReason: params.candidate.reason,
        stableConnectedSinceMs: null,
        pendingDowngradeText: null,
        pendingDowngradeSinceMs: null,
      },
    };
  }

  const candidate = params.candidate;
  const prev = params.previous;
  const previousText = prev?.displayedText ?? candidate.text;
  const hadStableConnected =
    prev?.stableConnectedSinceMs != null ||
    STABLE_CONNECTED_LABELS.has(previousText);

  if (STABLE_CONNECTED_LABELS.has(candidate.text)) {
    return {
      status: candidate,
      state: {
        displayedText: candidate.text,
        displayedReason: candidate.reason,
        stableConnectedSinceMs: params.nowMs,
        pendingDowngradeText: null,
        pendingDowngradeSinceMs: null,
      },
    };
  }

  const keepConnectedEvidence =
    params.recentPlaySuccess ||
    params.audioActuallyPlaying ||
    params.playbackActive;

  if (
    hadStableConnected &&
    STABLE_CONNECTED_LABELS.has(previousText) &&
    SOFTER_DOWNGRADE_LABELS.has(candidate.text)
  ) {
    if (keepConnectedEvidence) {
      logUiLabelHold({
        remoteDeviceId: params.remoteDeviceId,
        previous: previousText,
        candidate: candidate.text,
        reason: "recent_playback_active",
      });
      return {
        status: {
          ...candidate,
          ...REMOTE_AUDIO_LABEL_STYLE.connected,
          text: previousText,
          reason: "hysteresis_hold_connected",
        },
        state: {
          displayedText: previousText,
          displayedReason: prev?.displayedReason ?? candidate.reason,
          stableConnectedSinceMs:
            prev?.stableConnectedSinceMs ?? params.nowMs,
          pendingDowngradeText: null,
          pendingDowngradeSinceMs: null,
        },
      };
    }

    if (candidate.text === "音声確認中") {
      logUiLabelHold({
        remoteDeviceId: params.remoteDeviceId,
        previous: previousText,
        candidate: candidate.text,
        reason: "short_transient",
      });
      return {
        status: {
          ...candidate,
          ...REMOTE_AUDIO_LABEL_STYLE.connected,
          text: previousText,
          reason: "hysteresis_hold_short_transient",
        },
        state: {
          displayedText: previousText,
          displayedReason: prev?.displayedReason ?? candidate.reason,
          stableConnectedSinceMs:
            prev?.stableConnectedSinceMs ?? params.nowMs,
          pendingDowngradeText: candidate.text,
          pendingDowngradeSinceMs:
            prev?.pendingDowngradeSinceMs ?? params.nowMs,
        },
      };
    }

    const pendingSince =
      prev?.pendingDowngradeText === candidate.text &&
      prev.pendingDowngradeSinceMs != null
        ? prev.pendingDowngradeSinceMs
        : params.nowMs;
    const pendingMs = params.nowMs - pendingSince;

    if (pendingMs < UI_LABEL_DOWNGRADE_FROM_CONNECTED_MS) {
      logUiLabelHold({
        remoteDeviceId: params.remoteDeviceId,
        previous: previousText,
        candidate: candidate.text,
        reason: `downgrade_pending_${pendingMs}ms`,
      });
      return {
        status: {
          ...candidate,
          ...REMOTE_AUDIO_LABEL_STYLE.connected,
          text: previousText,
          reason: "hysteresis_hold_downgrade_pending",
        },
        state: {
          displayedText: previousText,
          displayedReason: prev?.displayedReason ?? candidate.reason,
          stableConnectedSinceMs:
            prev?.stableConnectedSinceMs ?? params.nowMs,
          pendingDowngradeText: candidate.text,
          pendingDowngradeSinceMs: pendingSince,
        },
      };
    }
  }

  if (
    hadStableConnected &&
    candidate.text === "音声が不安定です" &&
    !keepConnectedEvidence
  ) {
    const pendingSince = prev?.pendingDowngradeSinceMs ?? params.nowMs;
    if (params.nowMs - pendingSince < UI_LABEL_DOWNGRADE_FROM_CONNECTED_MS) {
      logUiLabelHold({
        remoteDeviceId: params.remoteDeviceId,
        previous: previousText,
        candidate: candidate.text,
        reason: "unstable_not_sustained",
      });
      return {
        status: {
          ...candidate,
          ...REMOTE_AUDIO_LABEL_STYLE.connected,
          text: previousText,
          reason: "hysteresis_hold_unstable_pending",
        },
        state: {
          displayedText: previousText,
          displayedReason: prev?.displayedReason ?? candidate.reason,
          stableConnectedSinceMs:
            prev?.stableConnectedSinceMs ?? params.nowMs,
          pendingDowngradeText: candidate.text,
          pendingDowngradeSinceMs: pendingSince,
        },
      };
    }
  }

  return {
    status: candidate,
    state: {
      displayedText: candidate.text,
      displayedReason: candidate.reason,
      stableConnectedSinceMs: STABLE_CONNECTED_LABELS.has(candidate.text)
        ? params.nowMs
        : prev?.stableConnectedSinceMs ?? null,
      pendingDowngradeText: null,
      pendingDowngradeSinceMs: null,
    },
  };
}

export function computeAudioUnhealthySinceMs(params: {
  nowMs: number;
  remoteAudioHealth?: RemoteAudioHealthInput | null;
  hasRemoteStream: boolean;
  trackReady?: string;
  wasPeerConnected: boolean;
}): number | null {
  if (!params.wasPeerConnected) return null;
  const health = params.remoteAudioHealth;
  const trackReady = params.trackReady ?? "-";
  const now = params.nowMs;

  if (trackReady === "ended") {
    return health?.playFailedAt ?? now;
  }

  if (
    isStalePlayFailure(health, now) &&
    health?.playFailedAt != null
  ) {
    return health.playFailedAt;
  }

  if (
    !params.hasRemoteStream ||
    trackReady === "-" ||
    trackReady === "ended"
  ) {
    return health?.lastAttachAt ?? now;
  }

  if (
    params.hasRemoteStream &&
    trackReady === "live" &&
    health?.audioActuallyPlaying !== true &&
    (health?.lastPlaySuccessAt == null ||
      now - health.lastPlaySuccessAt >= RECONNECT_BUTTON_STALL_MS)
  ) {
    return (
      health?.lastAttachAt ??
      health?.playFailedAt ??
      now - RECONNECT_BUTTON_STALL_MS
    );
  }

  return null;
}

export function resolveDisplayManualAudioReconnect(params: {
  isMe: boolean;
  hasRemoteStream: boolean;
  trackReady?: string;
  conn: string;
  ice: string;
  hasPc: boolean;
  remoteAudioHealth?: RemoteAudioHealthInput | null;
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
  lastPlaySuccessAt?: number | null;
  lastPlaybackConfirmedAt?: number | null;
  lastPlaybackActiveAt?: number | null;
  liveStreamHealHold?: boolean;
  p2pDirectFailedHoldActive?: boolean;
  autoHardResetInProgress?: boolean;
  autoHardResetGiveUp?: boolean;
  reconnectRequestPending?: boolean;
  wasPeerConnected?: boolean;
  nowMs?: number;
  debugUi?: boolean;
  audioUnhealthySinceMs?: number | null;
}): { show: boolean; reason: string } {
  const base = resolveManualAudioReconnect(params);
  if (!base.show) return base;
  if (params.debugUi === true) return base;

  const now = params.nowMs ?? Date.now();
  const since = params.audioUnhealthySinceMs;
  if (since == null) {
    return { show: false, reason: "unhealthy_since_unknown" };
  }
  if (now - since < UI_RECONNECT_BUTTON_MIN_UNHEALTHY_MS) {
    return { show: false, reason: `unhealthy_too_short_${now - since}ms` };
  }
  return base;
}

export function resolveUserFacingRemoteAudioLabel(params: {
  health: RemoteAudioHealthInput | null;
  showReconnectButton: boolean;
  trackLive: boolean;
  hasRemoteStream: boolean;
  recentPlaySuccess: boolean;
  transportUnconfirmed?: boolean;
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
  lastPlaySuccessAt?: number | null;
  nowMs: number;
}): {
  text: string;
  color: string;
  chipBg: string;
  chipText: string;
  reason: string;
  source: string;
  statusSource: string;
} {
  const health = params.health;
  const verified = health?.verified === true;
  const actuallyPlaying = health?.audioActuallyPlaying === true;
  const provisional =
    health?.playbackActiveMode === "provisional" ||
    (health?.playbackActive === true && !verified && !actuallyPlaying);

  const base = {
    source: "remoteAudioHealth",
    statusSource: "remote_audio_health",
  };

  if (params.transportUnconfirmed === true) {
    return {
      ...base,
      ...REMOTE_AUDIO_LABEL_STYLE.confirming,
      text: "音声を調整中",
      reason: "transport_unconfirmed",
    };
  }

  if (
    (verified || actuallyPlaying) &&
    params.showReconnectButton === false
  ) {
    return {
      ...base,
      ...REMOTE_AUDIO_LABEL_STYLE.connected,
      text: "接続済み",
      reason: verified
        ? "remote_audio_verified_connected"
        : "remote_audio_playing_connected",
    };
  }

  if (
    provisional ||
    params.recentPlaySuccess ||
    health?.playbackActive === true ||
    actuallyPlaying
  ) {
    return {
      ...base,
      ...REMOTE_AUDIO_LABEL_STYLE.receiving,
      text: "音声受信中",
      reason: provisional
        ? "remote_audio_provisional_receiving"
        : "remote_audio_playback_receiving",
    };
  }

  if (
    shouldShowPrePlayConfirmingLabel({
      hasRemoteStream: params.hasRemoteStream,
      trackReady: params.trackLive ? "live" : "-",
      lastOnTrackAt: params.lastOnTrackAt,
      lastUnmuteAt: params.lastUnmuteAt,
      lastPlaySuccessAt: params.lastPlaySuccessAt,
      nowMs: params.nowMs,
    })
  ) {
    return {
      ...base,
      ...REMOTE_AUDIO_LABEL_STYLE.confirming,
      text: "音声確認中",
      reason: "remote_audio_pre_play_confirming",
    };
  }

  if (params.trackLive && params.hasRemoteStream) {
    return {
      ...base,
      ...REMOTE_AUDIO_LABEL_STYLE.receiving,
      text: "音声受信中",
      reason: "remote_audio_stream_live",
    };
  }

  return {
    ...base,
    ...REMOTE_AUDIO_LABEL_STYLE.processing,
    text: "接続処理中",
    reason: "remote_audio_setup_in_progress",
  };
}

export function mergeRemoteAudioHealthInput(params: {
  health?: RemoteAudioHealthInput | null;
  trackReady?: string;
  lastPlaySuccessAt?: number | null;
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
}): RemoteAudioHealthInput | null {
  const health = params.health;
  if (!health && params.lastPlaySuccessAt == null) return null;

  return {
    ...health,
    trackReady: health?.trackReady ?? params.trackReady,
    lastPlaySuccessAt:
      health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt ?? null,
    playFailedAt: health?.playFailedAt ?? null,
  };
}

export function isRemoteAudioHealthyNow(params: {
  health?: RemoteAudioHealthInput | null;
  trackReady: string;
  hasRemoteStream: boolean;
  nowMs: number;
  lastPlaySuccessAt?: number | null;
}): boolean {
  const health = params.health;
  const trackReady = health?.trackReady ?? params.trackReady;
  const trackLive = trackReady === "live";
  if (!trackLive || !params.hasRemoteStream) return false;

  const lastPlaySuccessAt =
    health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt ?? null;
  const recentPlaySuccess = isRecentPlaySuccess(lastPlaySuccessAt, params.nowMs);

  if (health && isStalePlayFailure(health, params.nowMs)) return false;

  if (health?.audioActuallyPlaying === true) return true;
  if (recentPlaySuccess) return true;
  if (health?.verified === true && recentPlaySuccess) return true;
  if (health?.playSuccess === true && recentPlaySuccess) return true;
  if (health?.playbackActive === true && recentPlaySuccess) return true;

  if (
    health &&
    recentPlaySuccess &&
    (health.currentTimeAdvanced === true ||
      (health.level ?? 0) > REMOTE_AUDIO_LEVEL_ACTIVE_THRESHOLD)
  ) {
    return true;
  }

  return false;
}

export function resolveManualAudioReconnect(params: {
  isMe: boolean;
  hasRemoteStream: boolean;
  trackReady?: string;
  conn: string;
  ice: string;
  hasPc: boolean;
  remoteAudioHealth?: RemoteAudioHealthInput | null;
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
  lastPlaySuccessAt?: number | null;
  lastPlaybackConfirmedAt?: number | null;
  lastPlaybackActiveAt?: number | null;
  liveStreamHealHold?: boolean;
  p2pDirectFailedHoldActive?: boolean;
  autoHardResetInProgress?: boolean;
  autoHardResetGiveUp?: boolean;
  reconnectRequestPending?: boolean;
  wasPeerConnected?: boolean;
  nowMs?: number;
}): { show: boolean; reason: string } {
  if (params.isMe) return { show: false, reason: "is_me" };
  if (params.reconnectRequestPending) {
    return { show: false, reason: "reconnect_request_pending" };
  }
  if (params.autoHardResetInProgress) {
    return { show: false, reason: "auto_hard_reset_in_progress" };
  }

  const now = params.nowMs ?? Date.now();
  const trackReady = params.trackReady ?? "-";
  const health = mergeRemoteAudioHealthInput({
    health: params.remoteAudioHealth,
    trackReady,
    lastPlaySuccessAt: params.lastPlaySuccessAt,
    lastOnTrackAt: params.lastOnTrackAt,
    lastUnmuteAt: params.lastUnmuteAt,
  });

  if (
    isRemoteAudioHealthyNow({
      health,
      trackReady,
      hasRemoteStream: params.hasRemoteStream,
      nowMs: now,
      lastPlaySuccessAt: params.lastPlaySuccessAt,
    })
  ) {
    return { show: false, reason: "audio_healthy" };
  }

  if (params.liveStreamHealHold === true) {
    return { show: false, reason: "live_stream_heal_hold" };
  }

  if (
    hasRecentRemoteAudioSignals({
      lastOnTrackAt: params.lastOnTrackAt,
      lastUnmuteAt: params.lastUnmuteAt,
      lastPlaySuccessAt: health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
      nowMs: now,
    }) &&
    trackReady === "live" &&
    params.hasRemoteStream
  ) {
    return { show: false, reason: "recent_remote_signals" };
  }

  if (isRecentPlaySuccess(health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt, now)) {
    return { show: false, reason: "recent_play_success" };
  }

  if (trackReady === "ended") {
    return { show: true, reason: "track_ended" };
  }

  if (isStalePlayFailure(health, now)) {
    return { show: true, reason: "play_failed_recent" };
  }

  const noLiveStream =
    !params.hasRemoteStream || trackReady === "ended" || trackReady === "-";
  if (noLiveStream && params.wasPeerConnected) {
    return { show: true, reason: "no_live_stream" };
  }

  const audioStalled =
    params.hasRemoteStream &&
    trackReady === "live" &&
    health?.audioActuallyPlaying !== true &&
    (health?.lastPlaySuccessAt == null ||
      now - health.lastPlaySuccessAt >= RECONNECT_BUTTON_STALL_MS) &&
    (health?.level ?? 0) <= REMOTE_AUDIO_LEVEL_ACTIVE_THRESHOLD &&
    health?.currentTimeAdvanced !== true &&
    (health?.lastAttachAt == null ||
      now - health.lastAttachAt >= RECONNECT_BUTTON_STALL_MS);

  if (audioStalled && params.wasPeerConnected) {
    return { show: true, reason: "audio_stalled" };
  }

  if (params.autoHardResetGiveUp) {
    if (
      isRecentPlaySuccess(health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt, now) ||
      isRemoteAudioHealthyNow({
        health,
        trackReady,
        hasRemoteStream: params.hasRemoteStream,
        nowMs: now,
        lastPlaySuccessAt: params.lastPlaySuccessAt,
      })
    ) {
      return { show: false, reason: "auto_hard_reset_give_up_recovered" };
    }
    return { show: true, reason: "auto_hard_reset_give_up" };
  }

  if (
    params.p2pDirectFailedHoldActive &&
    (params.wasPeerConnected || !params.hasPc)
  ) {
    return { show: false, reason: "p2p_direct_failed_hold_recovering" };
  }

  if (params.autoHardResetInProgress) {
    return { show: false, reason: "auto_hard_reset_in_progress" };
  }

  const failedTransport = params.conn === "failed" || params.ice === "failed";
  if (failedTransport && params.wasPeerConnected) {
    return { show: false, reason: "transport_failed_recovering" };
  }

  const orphanNoPc = !params.hasPc && params.hasRemoteStream;
  if (orphanNoPc) {
    return { show: true, reason: "orphan_remote_audio" };
  }

  return { show: false, reason: "none" };
}

export type PlaybackActiveMode = "confirmed" | "provisional" | "none";

export function isActivePlaybackConnected(params: {
  remoteTracksCount: number;
  hasRemoteStream: boolean;
  trackReady: string;
  lastPlaybackActiveAt: number | null;
  lastPlaybackConfirmedAt?: number | null;
  playbackActive?: boolean;
  playbackActiveMode?: PlaybackActiveMode;
  nowMs?: number;
}): boolean {
  const now = params.nowMs ?? Date.now();
  const trackLive = params.trackReady === "live";
  const hasMedia =
    params.remoteTracksCount > 0 && params.hasRemoteStream && trackLive;
  if (!hasMedia) return false;

  const playbackRecent =
    params.lastPlaybackActiveAt != null &&
    now - params.lastPlaybackActiveAt < PLAYBACK_EFFECTIVE_CONNECTED_MS;
  const confirmedRecent =
    params.lastPlaybackConfirmedAt != null &&
    now - params.lastPlaybackConfirmedAt < PLAYBACK_EFFECTIVE_CONNECTED_MS;

  return (
    confirmedRecent ||
    playbackRecent ||
    params.playbackActive === true ||
    params.playbackActiveMode === "confirmed" ||
    params.playbackActiveMode === "provisional"
  );
}

export function resolveEffectivePeerConnection(params: {
  peerState: CallPeerState;
  remoteTracksCount: number;
  hasRemoteStream: boolean;
  trackReady: string;
  lastPlaybackActiveAt: number | null;
  lastPlaybackConfirmedAt?: number | null;
  playbackActive?: boolean;
  playbackActiveMode?: PlaybackActiveMode;
  transportUnconfirmed?: boolean;
  nowMs?: number;
}): {
  effectivePeerState: EffectivePeerState;
  effectiveConnected: boolean;
  activePlaybackConnected: boolean;
} {
  const activePlaybackConnected = isActivePlaybackConnected(params);

  if (params.peerState === "connected") {
    return {
      effectivePeerState: "connected",
      effectiveConnected: true,
      activePlaybackConnected,
    };
  }

  if (
    activePlaybackConnected &&
    params.transportUnconfirmed !== true &&
    (params.peerState === "connecting" || params.peerState === "idle")
  ) {
    return {
      effectivePeerState: "connected_effective",
      effectiveConnected: true,
      activePlaybackConnected: true,
    };
  }

  return {
    effectivePeerState: params.peerState,
    effectiveConnected: false,
    activePlaybackConnected,
  };
}

export const PRESENCE_FRESH_MS_HOME = 45_000;
export const PRESENCE_FRESH_MS_ROOM = 15_000;
export const PRESENCE_STALE_GRACE_MS = 20_000;

export type ParticipationSource = {
  is_in_call?: boolean;
  screen?: string | null;
  session_id?: string | null;
  presence_session_id?: string | null;
  last_seen_at?: string | null;
  effective_status?: string | null;
  status?: string | null;
};

export function parseTimestamp(value?: string | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

export function isPresenceFresh(
  lastSeenAt?: string | null,
  maxAgeMs = PRESENCE_FRESH_MS_HOME
): boolean {
  const t = parseTimestamp(lastSeenAt);
  if (t == null) return false;
  return Date.now() - t <= maxAgeMs;
}

function normalizedEffective(source: ParticipationSource) {
  return String(source.effective_status ?? source.status ?? "")
    .trim()
    .toLowerCase();
}

function buildUiMemberStatusInput(params: {
  source: ParticipationSource;
  currentSessionId?: string | null;
  freshMs?: number;
  previous?: UiParticipationStatus | null;
  previousInternal?: InternalMemberStatus | null;
  fetchFailed?: boolean;
  localExitedCall?: boolean;
  context?: "home" | "room";
  deviceId?: string;
  inSessionMembers?: boolean;
  inClassMembership?: boolean;
  lastInSessionAt?: number | null;
  isMe?: boolean;
}) {
  const {
    source,
    currentSessionId,
    freshMs = PRESENCE_FRESH_MS_HOME,
    previous = null,
    previousInternal = null,
    fetchFailed = false,
    localExitedCall = false,
    context = "home",
    deviceId = "",
    inSessionMembers = false,
    inClassMembership = true,
    lastInSessionAt,
    isMe = false,
  } = params;

  const uiSource = sanitizePresenceForUi(source, freshMs);

  return {
    context,
    deviceId,
    inSessionMembers,
    inClassMembership,
    explicitLeaveSeen: localExitedCall,
    localExitedCall,
    isMe,
    is_in_call: uiSource.is_in_call,
    screen: uiSource.screen,
    last_seen_at: source.last_seen_at,
    presenceSessionId:
      uiSource.presence_session_id ?? uiSource.session_id ?? null,
    currentSessionId,
    effective_status: uiSource.effective_status ?? uiSource.status ?? null,
    lastInSessionAt,
    previousInternal,
    previousParticipation: previous,
    fetchFailed,
    freshMs,
  };
}

export function resolveParticipationStatus(params: {
  source: ParticipationSource;
  currentSessionId?: string | null;
  freshMs?: number;
  previous?: UiParticipationStatus | null;
  previousInternal?: InternalMemberStatus | null;
  fetchFailed?: boolean;
  localExitedCall?: boolean;
  context?: "home" | "room";
  deviceId?: string;
  inSessionMembers?: boolean;
  inClassMembership?: boolean;
  lastInSessionAt?: number | null;
  isMe?: boolean;
}): UiParticipationStatus {
  const { participation } = resolveMemberParticipationForUi(
    buildUiMemberStatusInput(params)
  );
  return participation;
}

export function resolveParticipationDisplay(params: {
  source: ParticipationSource;
  currentSessionId?: string | null;
  freshMs?: number;
  previous?: UiParticipationStatus | null;
  previousInternal?: InternalMemberStatus | null;
  fetchFailed?: boolean;
  localExitedCall?: boolean;
  context?: "home" | "room";
  deviceId?: string;
  inSessionMembers?: boolean;
  inClassMembership?: boolean;
  lastInSessionAt?: number | null;
  isMe?: boolean;
}) {
  return resolveMemberParticipationForUi(buildUiMemberStatusInput(params));
}

export function participationStatusLabel(
  status: UiParticipationStatus,
  context: "home" | "room",
  unified?: UnifiedMemberStatus,
  internal?: InternalMemberStatus
): string {
  if (internal) {
    if (internal === "in_voice") return "通話中";
    if (internal === "connecting_voice") {
      return context === "room" ? "接続準備中" : "接続中";
    }
    if (internal === "in_room") return "待機中";
    if (internal === "in_session") {
      return context === "room" ? "入室中" : "入室中";
    }
    if (internal === "member_only") return "所属中";
    return "オフライン";
  }
  if (unified) {
    if (unified === "in_call") return "通話中";
    if (unified === "connecting") {
      return context === "room" ? "接続準備中" : "接続中";
    }
    if (unified === "in_room") return "待機中";
    if (unified === "in_session") return context === "room" ? "入室中" : "入室中";
    if (unified === "member_only") return "所属中";
    return "オフライン";
  }
  if (status === "in_call") return "通話中";
  if (status === "waiting") return "待機中";
  return "オフライン";
}

export function participationStatusStyle(status: UiParticipationStatus) {
  if (status === "in_call") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }

  if (status === "waiting") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fcd34d",
    };
  }

  return {
    background: "#f3f4f6",
    color: "#6b7280",
    border: "1px solid #d1d5db",
  };
}

export function shouldShowManualAudioReconnect(params: {
  isMe: boolean;
  statusText?: string;
  statusReason?: string;
  conn: string;
  ice: string;
  hasPc: boolean;
  hasRemoteStream: boolean;
  lastPlaybackConfirmedAt?: number | null;
  lastPlaybackActiveAt?: number | null;
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
  lastPlaySuccessAt?: number | null;
  remoteAudioHealth?: RemoteAudioHealthInput | null;
  trackReady?: string;
  liveStreamHealHold?: boolean;
  p2pDirectFailedHoldActive?: boolean;
  autoHardResetGiveUp?: boolean;
  reconnectRequestPending?: boolean;
  wasPeerConnected?: boolean;
  nowMs?: number;
}): boolean {
  return resolveManualAudioReconnect(params).show;
}

export function resolveCallMemberStatus(params: {
  isMe: boolean;
  isMuted: boolean;
  isInCall: boolean;
  inSessionMember?: boolean;
  viewerOnCallScreen?: boolean;
  screen?: string | null;
  localExitedCall?: boolean;
  peerState: CallPeerState;
  effectivePeerState?: EffectivePeerState;
  activePlaybackConnected?: boolean;
  playbackActiveMode?: PlaybackActiveMode;
  hasPc?: boolean;
  orphanRemoteAudio?: boolean;
  p2pDirectFailedHoldActive?: boolean;
  transportUnconfirmed?: boolean;
  liveStreamHealHold?: boolean;
  autoHardResetInProgress?: boolean;
  autoHardResetGiveUp?: boolean;
  wasPeerConnected: boolean;
  remoteAudioVerified?: boolean | null;
  remoteAudioHealth?: RemoteAudioHealthInput | null;
  hasRemoteStream?: boolean;
  trackReady?: string;
  conn?: string;
  ice?: string;
  lastOnTrackAt?: number | null;
  lastUnmuteAt?: number | null;
  lastPlaySuccessAt?: number | null;
  lastPlaybackConfirmedAt?: number | null;
  lastPlaybackActiveAt?: number | null;
  p2pRetryActive?: boolean;
  p2pRetryExhausted?: boolean;
  showReconnectButton?: boolean;
  nowMs?: number;
}): {
  text: string;
  color: string;
  chipBg: string;
  chipText: string;
  reason: string;
  source: string;
  statusSource?: string;
} {
  const nowMs = params.nowMs ?? Date.now();
  const trackReady = params.trackReady ?? "-";
  const conn = params.conn ?? "-";
  const ice = params.ice ?? "-";
  const hasRemoteStream = params.hasRemoteStream === true;
  const health = mergeRemoteAudioHealthInput({
    health: params.remoteAudioHealth,
    trackReady,
    lastPlaySuccessAt: params.lastPlaySuccessAt,
    lastOnTrackAt: params.lastOnTrackAt,
    lastUnmuteAt: params.lastUnmuteAt,
  });

  const showReconnectButton =
    params.showReconnectButton ??
    resolveManualAudioReconnect({
      isMe: false,
      hasRemoteStream,
      trackReady,
      conn,
      ice,
      hasPc: params.hasPc ?? false,
      remoteAudioHealth: health,
      lastOnTrackAt: params.lastOnTrackAt,
      lastUnmuteAt: params.lastUnmuteAt,
      lastPlaySuccessAt: params.lastPlaySuccessAt,
      liveStreamHealHold: params.liveStreamHealHold,
      p2pDirectFailedHoldActive: params.p2pDirectFailedHoldActive,
      autoHardResetGiveUp: params.autoHardResetGiveUp,
      wasPeerConnected: params.wasPeerConnected,
      nowMs,
    }).show;

  const audioHealthy = isRemoteAudioHealthyNow({
    health,
    trackReady,
    hasRemoteStream,
    nowMs,
    lastPlaySuccessAt: params.lastPlaySuccessAt,
  });
  const recentPlaySuccess = isRecentPlaySuccess(
    health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
    nowMs
  );
  const recentSignals = hasRecentRemoteAudioSignals({
    lastOnTrackAt: params.lastOnTrackAt,
    lastUnmuteAt: params.lastUnmuteAt,
    lastPlaySuccessAt: health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
    nowMs,
  });
  const trackLive = trackReady === "live";
  const transportConnected = isTransportMediaConnected(conn, ice);
  const prePlayConfirming = isPrePlaySuccessConfirming({
    hasRemoteStream,
    trackReady,
    lastOnTrackAt: params.lastOnTrackAt,
    lastUnmuteAt: params.lastUnmuteAt,
    lastPlaySuccessAt: health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
    nowMs,
  });

  const remoteAudioUserLabel = () =>
    resolveUserFacingRemoteAudioLabel({
      health,
      showReconnectButton,
      trackLive,
      hasRemoteStream,
      recentPlaySuccess,
      transportUnconfirmed: params.transportUnconfirmed,
      lastOnTrackAt: params.lastOnTrackAt,
      lastUnmuteAt: params.lastUnmuteAt,
      lastPlaySuccessAt: health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
      nowMs,
    });
  const screen = String(params.screen ?? "").trim();
  const stable = isStableVoiceJoinMode();
  const inSessionMember = params.inSessionMember !== false;
  const forceWaiting = stable
    ? params.localExitedCall === true
    : params.localExitedCall === true ||
      screen === "room" ||
      screen === "home" ||
      params.isInCall !== true;

  const skipParticipationDowngrade =
    stable && inSessionMember && !params.localExitedCall;
  const onCallScreen = params.viewerOnCallScreen !== false;

  if (params.isMe) {
    if (onCallScreen && !params.localExitedCall) {
      return {
        text: params.isMuted ? "自分 / ミュート中" : "自分 / 発話可能",
        color: "#6b7280",
        chipBg: params.isMuted ? "#fef2f2" : "#eff6ff",
        chipText: params.isMuted ? "#991b1b" : "#1d4ed8",
        reason: "self_on_call_screen",
        source: "isMe",
      };
    }

    if (params.localExitedCall) {
      return {
        text: "待機中",
        color: "#6b7280",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
        reason: "localExitedCall",
        source: "participation",
      };
    }

    if (forceWaiting && !skipParticipationDowngrade) {
      return {
        text: "待機中",
        color: "#6b7280",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
        reason: screen === "room" ? "screen_room" : "is_in_call_false",
        source: "participation",
      };
    }

    return {
      text: params.isMuted ? "自分 / ミュート中" : "自分 / 発話可能",
      color: "#6b7280",
      chipBg: params.isMuted ? "#fef2f2" : "#eff6ff",
      chipText: params.isMuted ? "#991b1b" : "#1d4ed8",
      reason: "self_in_call",
      source: "isMe",
    };
  }

  if (forceWaiting && !skipParticipationDowngrade) {
    return {
      text: "待機中",
      color: "#6b7280",
      chipBg: "#f3f4f6",
      chipText: "#6b7280",
      reason: params.localExitedCall
        ? "localExitedCall"
        : screen === "room"
          ? "screen_room"
          : screen === "home"
            ? "screen_home"
            : "is_in_call_false",
      source: "participation",
    };
  }

  if (
    skipParticipationDowngrade &&
    params.peerState === "idle" &&
    !params.hasPc &&
    !params.wasPeerConnected
  ) {
    if (screen === "room" || screen === "home") {
      return {
        text: "接続準備中",
        color: "#92400e",
        chipBg: "#fffbeb",
        chipText: "#b45309",
        reason: "session_member_no_voice_state",
        source: "memberStatus",
      };
    }
    return {
      text: "接続準備中",
      color: "#92400e",
      chipBg: "#fffbeb",
      chipText: "#b45309",
      reason: "session_member_stable",
      source: "memberStatus",
    };
  }

  if (params.autoHardResetInProgress) {
    return {
      text: "音声を調整中",
      color: "#92400e",
      chipBg: "#fffbeb",
      chipText: "#b45309",
      reason: "auto_hard_reset_in_progress",
      source: "autoHardReset",
    };
  }

  const p2pEstablished = isPeerP2pEstablished({
    conn,
    ice,
    lastPlaybackConfirmedAt: params.lastPlaybackConfirmedAt,
    trackReady,
    lastPlaybackActiveAt: params.lastPlaybackActiveAt,
    lastPlaySuccessAt: health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
    audioActuallyPlaying: health?.audioActuallyPlaying === true,
    nowMs,
  });

  const transportRecovering =
    !p2pEstablished &&
    params.wasPeerConnected &&
    (params.transportUnconfirmed === true ||
      params.p2pRetryActive === true ||
      params.p2pRetryExhausted === true ||
      (params.p2pDirectFailedHoldActive === true &&
        (!params.hasPc ||
          params.conn === "failed" ||
          params.ice === "failed" ||
          params.peerState === "failed" ||
          params.ice === "checking" ||
          params.conn === "connecting")));

  if (transportRecovering) {
    const adjustingConnection =
      params.ice === "checking" || params.conn === "connecting";
    return {
      text: adjustingConnection ? "接続を調整中" : "音声を調整中",
      color: "#92400e",
      chipBg: "#fffbeb",
      chipText: "#b45309",
      reason: adjustingConnection
        ? "transport_recovering_p2p_retry_connecting"
        : "transport_recovering_p2p_retry",
      source: "autoHardReset",
    };
  }

  // A. RemoteAudio playback health overrides conn/ice while audio is actually playing.
  if (
    trackLive &&
    hasRemoteStream &&
    (audioHealthy || (health?.playSuccess === true && recentPlaySuccess))
  ) {
    return remoteAudioUserLabel();
  }

  // Grace-period heal hold: avoid "接続処理中" while stream/signals are fresh.
  if (params.liveStreamHealHold === true) {
    if (recentPlaySuccess || health?.playSuccess === true) {
      return remoteAudioUserLabel();
    }
    if (
      shouldShowPrePlayConfirmingLabel({
        hasRemoteStream,
        trackReady,
        lastOnTrackAt: params.lastOnTrackAt,
        lastUnmuteAt: params.lastUnmuteAt,
        lastPlaySuccessAt: health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
        nowMs,
      })
    ) {
      return {
        ...REMOTE_AUDIO_LABEL_STYLE.confirming,
        text: "音声確認中",
        reason: "live_stream_heal_hold",
        source: "remoteAudioHealth",
        statusSource: "remote_audio_health",
      };
    }
    return remoteAudioUserLabel();
  }

  // B. Live track + remote stream + recent ontrack/unmute (play-success 前は音声確認中).
  if (trackLive && hasRemoteStream && recentSignals) {
    if (
      shouldShowPrePlayConfirmingLabel({
        hasRemoteStream,
        trackReady,
        lastOnTrackAt: params.lastOnTrackAt,
        lastUnmuteAt: params.lastUnmuteAt,
        lastPlaySuccessAt: health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
        nowMs,
      })
    ) {
      return {
        ...REMOTE_AUDIO_LABEL_STYLE.confirming,
        text: "音声確認中",
        reason: "recent_remote_signal_pre_play",
        source: "remoteAudioHealth",
        statusSource: "remote_audio_health",
      };
    }
    return remoteAudioUserLabel();
  }

  if (params.activePlaybackConnected && params.peerState !== "connected") {
    const orphanPlayback =
      params.hasPc === false || params.orphanRemoteAudio === true;

    if (orphanPlayback) {
      if (audioHealthy || recentPlaySuccess) {
        return remoteAudioUserLabel();
      }
      if (
        shouldShowPrePlayConfirmingLabel({
          hasRemoteStream,
          trackReady,
          lastOnTrackAt: params.lastOnTrackAt,
          lastUnmuteAt: params.lastUnmuteAt,
          lastPlaySuccessAt: health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
          nowMs,
        })
      ) {
        return {
          ...REMOTE_AUDIO_LABEL_STYLE.confirming,
          text: "音声確認中",
          reason: "orphan_remote_audio_provisional",
          source: "effectivePeerState",
        };
      }
      return {
        ...REMOTE_AUDIO_LABEL_STYLE.processing,
        text: params.wasPeerConnected ? "再接続中" : "接続処理中",
        reason: "orphan_remote_audio_setup",
        source: "effectivePeerState",
      };
    }

    return remoteAudioUserLabel();
  }

  // C. Transport connected (conn/ice), when playback health has not already won.
  if (params.peerState === "connected" || transportConnected) {
    if (
      audioHealthy ||
      recentPlaySuccess ||
      params.remoteAudioVerified === true ||
      (recentSignals && !prePlayConfirming)
    ) {
      return remoteAudioUserLabel();
    }

    if (
      shouldShowPrePlayConfirmingLabel({
        hasRemoteStream,
        trackReady,
        lastOnTrackAt: params.lastOnTrackAt,
        lastUnmuteAt: params.lastUnmuteAt,
        lastPlaySuccessAt: health?.lastPlaySuccessAt ?? params.lastPlaySuccessAt,
        nowMs,
      })
    ) {
      return {
        ...REMOTE_AUDIO_LABEL_STYLE.confirming,
        text: "音声確認中",
        reason: "peer_connected_audio_pending",
        source: "peerState",
      };
    }

    return {
      ...REMOTE_AUDIO_LABEL_STYLE.processing,
      text: "接続処理中",
      reason: "peer_connected_wait_stream",
      source: "peerState",
    };
  }

  if (params.autoHardResetGiveUp && !audioHealthy && !transportRecovering) {
    return {
      ...REMOTE_AUDIO_LABEL_STYLE.unstable,
      text: "音声が不安定です",
      reason: "auto_hard_reset_give_up",
      source: "autoHardReset",
    };
  }

  // D. Playback/track failure or stalled audio.
  const playFailedRecently = isStalePlayFailure(health, nowMs);
  const trackEnded = trackReady === "ended";
  const noLiveStream =
    !hasRemoteStream || trackReady === "ended" || trackReady === "-";
  const stalledAudio =
    hasRemoteStream &&
    trackLive &&
    !audioHealthy &&
    !recentSignals &&
    (health?.lastAttachAt == null ||
      nowMs - health.lastAttachAt >= REMOTE_AUDIO_UNSTABLE_MS);

  if (
    !transportRecovering &&
    (playFailedRecently ||
      trackEnded ||
      (noLiveStream && params.wasPeerConnected) ||
      (stalledAudio && params.wasPeerConnected))
  ) {
    return {
      ...REMOTE_AUDIO_LABEL_STYLE.unstable,
      text: "音声が不安定です",
      reason: playFailedRecently
        ? "remote_audio_play_failed"
        : trackEnded
          ? "remote_audio_track_ended"
          : noLiveStream
            ? "remote_audio_no_live_stream"
            : "remote_audio_stalled",
      source: "remoteAudioHealth",
      statusSource: "remote_audio_health",
    };
  }

  if (params.peerState === "connecting") {
    return {
      text: params.wasPeerConnected ? "再接続中" : "接続処理中",
      color: "#92400e",
      chipBg: "#fffbeb",
      chipText: "#b45309",
      reason: params.wasPeerConnected
        ? "peer_connecting_reconnect"
        : "peer_connecting_initial",
      source: "peerState",
    };
  }

  if (params.peerState === "failed") {
    if (params.p2pDirectFailedHoldActive || transportRecovering) {
      return {
        text: "音声を調整中",
        color: "#92400e",
        chipBg: "#fffbeb",
        chipText: "#b45309",
        reason: "p2p_direct_failed_turn_disabled",
        source: "peerState",
      };
    }

    return {
      text: params.wasPeerConnected ? "再接続を試みています" : "再接続中",
      color: "#991b1b",
      chipBg: "#fef2f2",
      chipText: "#dc2626",
      reason: params.wasPeerConnected ? "peer_failed_reconnect" : "peer_failed",
      source: "peerState",
    };
  }

  // E. No PC / no stream / offer wait.
  if (!params.hasPc && !hasRemoteStream) {
    return {
      ...REMOTE_AUDIO_LABEL_STYLE.processing,
      text: "接続処理中",
      reason: "peer_idle_wait_offer",
      source: "peerState",
    };
  }

  return {
    ...REMOTE_AUDIO_LABEL_STYLE.processing,
    text: "接続処理中",
    reason: "peer_setup_in_progress",
    source: "peerState",
  };
}

export function logParticipationStatusDecision(params: {
  context: "home" | "room" | "call";
  deviceId: string;
  label: string;
  status: string;
  used: string;
  reason?: string;
  sources: Record<string, unknown>;
}) {
  debugConsoleLog(`[${params.context}-status]`, {
    deviceId: params.deviceId,
    label: params.label,
    status: params.status,
    used: params.used,
    reason: params.reason ?? null,
    sources: params.sources,
    timestamp: Date.now(),
  });
}

export function mapPresenceApiRow(
  raw: Record<string, unknown>,
  currentSessionId?: string
): (ParticipationSource & { device_id: string }) | null {
  const deviceId = String(raw.device_id ?? "").trim();
  if (!deviceId) return null;

  const lastSeenAt =
    String(raw.last_seen_at ?? raw.updated_at ?? "").trim() || null;

  return {
    device_id: deviceId,
    screen: String(raw.screen ?? "").trim() || null,
    session_id: String(raw.session_id ?? "").trim() || null,
    presence_session_id: String(raw.session_id ?? "").trim() || null,
    last_seen_at: lastSeenAt,
    effective_status:
      String(raw.effective_status ?? raw.status ?? "").trim() || null,
    status: String(raw.status ?? "").trim() || null,
    ...(currentSessionId ? {} : {}),
  };
}
