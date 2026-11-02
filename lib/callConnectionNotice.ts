/** Delay before showing prolonged reconnect on the hero chip (brief blips stay silent). */
export const CALL_RECONNECT_NOTICE_DELAY_MS = 3500;

export type CallHeroConnectionState = {
  statusLabel: string;
  statusTone: "waiting" | "incall" | "neutral" | "reconnect" | "error";
  /** When true, the hero chip should accept a tap to retry reconnect. */
  statusActionable: boolean;
};

/**
 * Hero chip for call chrome.
 * - Solo healthy room → 待機中 (never 再接続中 just because peers=0)
 * - True peer repair / prolonged reconnect only when call-active remotes exist
 * - Short reconnect blips stay silent via CALL_RECONNECT_NOTICE_DELAY_MS
 */
export function resolveCallHeroConnectionState(params: {
  voiceJoinFatalError?: boolean;
  showProlongedReconnectNotice?: boolean;
  membersLocked?: boolean;
  /** In-call strip count including self. */
  inCallCount?: number;
  /** True when at least one non-self member is expected on the call mesh. */
  hasCallActiveRemotes?: boolean;
}): CallHeroConnectionState {
  const inCallCount =
    typeof params.inCallCount === "number" && Number.isFinite(params.inCallCount)
      ? Math.max(0, Math.floor(params.inCallCount))
      : null;
  const hasRemotes = params.hasCallActiveRemotes === true;

  if (params.voiceJoinFatalError && hasRemotes) {
    return {
      statusLabel: "接続できません",
      statusTone: "error",
      statusActionable: true,
    };
  }

  // Never treat "no peers yet" as reconnect — that is normal solo wait.
  if (params.showProlongedReconnectNotice && hasRemotes) {
    return {
      statusLabel: "再接続中",
      statusTone: "reconnect",
      statusActionable: true,
    };
  }

  if (inCallCount != null && inCallCount <= 1) {
    return {
      statusLabel: "待機中",
      statusTone: "waiting",
      statusActionable: false,
    };
  }

  if (params.membersLocked === false) {
    return {
      statusLabel: "募集中",
      statusTone: "waiting",
      statusActionable: false,
    };
  }

  return {
    statusLabel: "通話中",
    statusTone: "incall",
    statusActionable: false,
  };
}

/**
 * Self is still on /call and has not explicitly left — keep in the strip
 * even if API presence lags (`is_in_call` false / missing).
 */
export function isSelfVisibleOnCallStrip(params: {
  memberId: string;
  viewerId: string;
  explicitLeft: boolean;
}): boolean {
  const memberId = String(params.memberId ?? "").trim();
  const viewerId = String(params.viewerId ?? "").trim();
  if (!memberId || !viewerId || memberId !== viewerId) return false;
  return !params.explicitLeft;
}
