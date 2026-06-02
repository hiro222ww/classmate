export type UiParticipationStatus = "in_call" | "waiting" | "offline";

export type CallPeerState = "idle" | "connecting" | "connected" | "failed";

export type EffectivePeerState = CallPeerState | "connected_effective";

export const PLAYBACK_EFFECTIVE_CONNECTED_MS = 15_000;
export const MANUAL_AUDIO_RECONNECT_UNCONFIRMED_MS = 15_000;
export const RECENT_REMOTE_SIGNAL_MS = 10_000;
export const REMOTE_AUDIO_PLAY_SUCCESS_RECENT_MS = 15_000;
export const REMOTE_AUDIO_UNSTABLE_MS = 15_000;
export const RECONNECT_BUTTON_STALL_MS = 15_000;
export const REMOTE_AUDIO_LEVEL_ACTIVE_THRESHOLD = 0.02;

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
  autoHardResetGiveUp?: boolean;
  reconnectRequestPending?: boolean;
  wasPeerConnected?: boolean;
  nowMs?: number;
}): { show: boolean; reason: string } {
  if (params.isMe) return { show: false, reason: "is_me" };
  if (params.reconnectRequestPending) {
    return { show: false, reason: "reconnect_request_pending" };
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

  if (params.p2pDirectFailedHoldActive && !params.hasPc) {
    return { show: false, reason: "p2p_direct_failed_hold" };
  }

  const failedTransport = params.conn === "failed" || params.ice === "failed";
  if (failedTransport && params.wasPeerConnected) {
    return { show: true, reason: "transport_failed" };
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

export function resolveParticipationStatus(params: {
  source: ParticipationSource;
  currentSessionId?: string | null;
  freshMs?: number;
  previous?: UiParticipationStatus | null;
  fetchFailed?: boolean;
  localExitedCall?: boolean;
}): UiParticipationStatus {
  const {
    source,
    currentSessionId,
    freshMs = PRESENCE_FRESH_MS_HOME,
    previous = null,
    fetchFailed = false,
    localExitedCall = false,
  } = params;

  const lastSeenAt = source.last_seen_at;
  const fresh = isPresenceFresh(lastSeenAt, freshMs);
  const lastTs = parseTimestamp(lastSeenAt);
  const staleGrace =
    lastTs != null && Date.now() - lastTs <= freshMs + PRESENCE_STALE_GRACE_MS;

  const screen = String(source.screen ?? "").trim();

  if (localExitedCall || screen === "room" || screen === "home") {
    return "waiting";
  }

  if (source.is_in_call === false) {
    return "waiting";
  }

  if (source.is_in_call === true) {
    return "in_call";
  }

  const sid = String(
    source.presence_session_id ?? source.session_id ?? ""
  ).trim();
  const currentSid = String(currentSessionId ?? "").trim();

  if (fresh) {
    if (screen === "call") {
      if (!currentSid || !sid || sid === currentSid) {
        return "in_call";
      }
    }

    const effective = normalizedEffective(source);
    if (
      effective === "calling" ||
      effective === "call" ||
      effective === "active"
    ) {
      if (!currentSid || !sid || sid === currentSid) {
        return "in_call";
      }
    }

    if (effective === "waiting" || effective === "room") {
      return "waiting";
    }
  }

  if ((fetchFailed || staleGrace) && previous && previous !== "offline") {
    return previous;
  }

  return "offline";
}

export function participationStatusLabel(
  status: UiParticipationStatus,
  context: "home" | "room"
): string {
  if (status === "in_call") return "通話中";
  if (status === "waiting") return "待機中";
  return context === "home" ? "オフライン" : "オフライン";
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
  screen?: string | null;
  localExitedCall?: boolean;
  peerState: CallPeerState;
  effectivePeerState?: EffectivePeerState;
  activePlaybackConnected?: boolean;
  playbackActiveMode?: PlaybackActiveMode;
  hasPc?: boolean;
  orphanRemoteAudio?: boolean;
  p2pDirectFailedHoldActive?: boolean;
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
  const health = params.remoteAudioHealth ?? null;

  const audioHealthy = isRemoteAudioHealthyNow({
    health,
    trackReady,
    hasRemoteStream,
    nowMs,
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

  const connectedFromRemoteAudio = (): {
    text: string;
    color: string;
    chipBg: string;
    chipText: string;
    reason: string;
    source: string;
    statusSource: string;
  } => {
    const connectedLabel =
      recentPlaySuccess ||
      health?.audioActuallyPlaying === true ||
      health?.verified === true ||
      params.remoteAudioVerified === true;
    return {
      text: connectedLabel ? "接続中" : "音声受信中",
      color: "#065f46",
      chipBg: "#ecfdf5",
      chipText: "#047857",
      reason: connectedLabel
        ? "remote_audio_playback_healthy"
        : "remote_audio_playback_active",
      source: "remoteAudioHealth",
      statusSource: "remote_audio_health",
    };
  };
  const screen = String(params.screen ?? "").trim();
  const forceWaiting =
    params.localExitedCall === true ||
    screen === "room" ||
    screen === "home" ||
    params.isInCall !== true;

  if (params.isMe) {
    if (forceWaiting) {
      return {
        text: "待機中",
        color: "#6b7280",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
        reason: params.localExitedCall
          ? "localExitedCall"
          : screen === "room"
            ? "screen_room"
            : "is_in_call_false",
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

  if (forceWaiting) {
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

  // A. RemoteAudio playback health overrides conn/ice while audio is actually playing.
  if (
    trackLive &&
    hasRemoteStream &&
    (audioHealthy || (health?.playSuccess === true && recentPlaySuccess))
  ) {
    return connectedFromRemoteAudio();
  }

  // Grace-period heal hold: avoid "接続処理中" while stream/signals are fresh.
  if (params.liveStreamHealHold === true) {
    if (recentPlaySuccess || health?.playSuccess === true) {
      return connectedFromRemoteAudio();
    }
    return {
      text: "音声確認中",
      color: "#92400e",
      chipBg: "#fffbeb",
      chipText: "#b45309",
      reason: "live_stream_heal_hold",
      source: "remoteAudioHealth",
      statusSource: "remote_audio_health",
    };
  }

  // B. Live track + remote stream + recent ontrack/unmute/play-success.
  if (trackLive && hasRemoteStream && recentSignals) {
    return connectedFromRemoteAudio();
  }

  if (params.activePlaybackConnected && params.peerState !== "connected") {
    const orphanPlayback =
      params.hasPc === false || params.orphanRemoteAudio === true;

    if (orphanPlayback) {
      if (audioHealthy || recentPlaySuccess) {
        return connectedFromRemoteAudio();
      }
      return {
        text: params.wasPeerConnected ? "再接続中" : "音声確認中",
        color: "#92400e",
        chipBg: "#fffbeb",
        chipText: "#b45309",
        reason: "orphan_remote_audio_provisional",
        source: "effectivePeerState",
      };
    }

    const playbackReason =
      params.playbackActiveMode === "confirmed"
        ? "active_playback_confirmed"
        : "active_playback_provisional";
    return {
      text: "通話中",
      color: "#065f46",
      chipBg: "#ecfdf5",
      chipText: "#047857",
      reason: playbackReason,
      source: "effectivePeerState",
    };
  }

  // C. Transport connected (conn/ice), when playback health has not already won.
  if (params.peerState === "connected" || transportConnected) {
    if (
      audioHealthy ||
      recentPlaySuccess ||
      params.remoteAudioVerified === true ||
      recentSignals
    ) {
      return connectedFromRemoteAudio();
    }

    return {
      text: "音声確認中",
      color: "#92400e",
      chipBg: "#fffbeb",
      chipText: "#b45309",
      reason: "peer_connected_audio_pending",
      source: "peerState",
    };
  }

  if (params.autoHardResetGiveUp && !audioHealthy) {
    return {
      text: "音声が不安定です",
      color: "#991b1b",
      chipBg: "#fef2f2",
      chipText: "#dc2626",
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
    playFailedRecently ||
    trackEnded ||
    (noLiveStream && params.wasPeerConnected) ||
    (stalledAudio && params.wasPeerConnected)
  ) {
    return {
      text: "音声が不安定です",
      color: "#991b1b",
      chipBg: "#fef2f2",
      chipText: "#dc2626",
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
    if (params.p2pDirectFailedHoldActive) {
      return {
        text: "再接続中",
        color: "#991b1b",
        chipBg: "#fef2f2",
        chipText: "#dc2626",
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
      text: "接続待ち",
      color: "#6b7280",
      chipBg: "#f3f4f6",
      chipText: "#6b7280",
      reason: "peer_idle",
      source: "peerState",
    };
  }

  return {
    text: "接続処理中",
    color: "#92400e",
    chipBg: "#fffbeb",
    chipText: "#b45309",
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
  console.log(`[${params.context}-status]`, {
    deviceId: params.deviceId,
    label: params.label,
    status: params.status,
    used: params.used,
    reason: params.reason ?? null,
    ...params.sources,
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
