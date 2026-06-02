export type UiParticipationStatus = "in_call" | "waiting" | "offline";

export type CallPeerState = "idle" | "connecting" | "connected" | "failed";

export type EffectivePeerState = CallPeerState | "connected_effective";

export const PLAYBACK_EFFECTIVE_CONNECTED_MS = 15_000;
export const MANUAL_AUDIO_RECONNECT_UNCONFIRMED_MS = 15_000;

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
  statusText: string;
  statusReason: string;
  conn: string;
  ice: string;
  hasPc: boolean;
  hasRemoteStream: boolean;
  lastPlaybackConfirmedAt: number | null;
  lastPlaybackActiveAt: number | null;
  p2pDirectFailedHoldActive?: boolean;
  nowMs?: number;
}): boolean {
  if (params.isMe) return false;

  const now = params.nowMs ?? Date.now();
  const failedTransport = params.conn === "failed" || params.ice === "failed";
  const orphanNoPc = !params.hasPc && params.hasRemoteStream;
  const reconnectingLabel =
    params.statusText === "再接続中" ||
    params.statusText === "音声確認中" ||
    params.statusText === "再接続を試みています";
  const matchingReason =
    params.statusReason === "orphan_remote_audio_provisional" ||
    params.statusReason === "p2p_direct_failed_turn_disabled" ||
    params.statusReason === "peer_failed_reconnect" ||
    params.statusReason === "peer_failed" ||
    params.statusReason === "peer_connecting_reconnect";
  const unconfirmedStuck =
    params.lastPlaybackConfirmedAt == null &&
    params.lastPlaybackActiveAt != null &&
    now - params.lastPlaybackActiveAt >= MANUAL_AUDIO_RECONNECT_UNCONFIRMED_MS;

  return (
    params.p2pDirectFailedHoldActive === true ||
    failedTransport ||
    orphanNoPc ||
    (reconnectingLabel && matchingReason) ||
    unconfirmedStuck
  );
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
  wasPeerConnected: boolean;
  remoteAudioVerified?: boolean | null;
}) {
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

  if (
    params.activePlaybackConnected &&
    params.peerState !== "connected"
  ) {
    const orphanPlayback =
      params.hasPc === false || params.orphanRemoteAudio === true;

    if (orphanPlayback) {
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

  if (params.peerState === "connected") {
    if (params.remoteAudioVerified === true) {
      return {
        text: "接続中",
        color: "#065f46",
        chipBg: "#ecfdf5",
        chipText: "#047857",
        reason: "peer_connected_audio_verified",
        source: "peerState",
      };
    }

    return {
      text: "音声確認中",
      color: "#92400e",
      chipBg: "#fffbeb",
      chipText: "#b45309",
      reason:
        params.remoteAudioVerified === false
          ? "peer_connected_audio_unverified"
          : "peer_connected_audio_pending",
      source: "peerState",
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

  return {
    text: "接続待ち",
    color: "#6b7280",
    chipBg: "#f3f4f6",
    chipText: "#6b7280",
    reason: "peer_idle",
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
