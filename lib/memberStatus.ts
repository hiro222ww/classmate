import { debugConsoleLog } from "@/lib/debugVoiceLog";
import { hasLocalLeftCall } from "@/lib/localCallExit";
import {
  isStableVoiceJoinMode,
  STABLE_REMOTE_PEER_GRACE_MS,
} from "@/lib/stableVoiceJoin";
import type { CallPeerState, EffectivePeerState } from "@/lib/memberPresenceStatus";
import {
  isPresenceFresh,
  isRecentPlaySuccess,
  PRESENCE_FRESH_MS_HOME,
  PRESENCE_STALE_GRACE_MS,
  type UiParticipationStatus,
} from "@/lib/memberPresenceStatus";

export type MemberStatusContext = "home" | "room" | "call";

/** UI-only status ladder (Home / Room / Call). Not used for peer connection targets. */
export type UnifiedMemberStatus =
  | "in_call"
  | "connecting"
  | "in_session"
  | "waiting"
  | "offline";

export type MemberStatusEvidence = {
  explicitLeaveSeen: boolean;
  missingFromSessionMembers: boolean;
  inSessionMembers: boolean;
  presenceOfflineForMs: number | null;
  peerState: string | null;
  audioConfirmedRecently: boolean;
  stableMode: boolean;
  is_in_call: boolean | null | undefined;
  screen: string | null;
};

export type ResolveMemberStatusInput = {
  context: MemberStatusContext;
  deviceId: string;
  /** Listed in session_members / visible session roster for this screen. */
  inSessionMembers: boolean;
  explicitLeaveSeen?: boolean;
  localExitedCall?: boolean;
  isMe?: boolean;
  /** Viewer is on /call (self must not downgrade to waiting from presence). */
  viewerOnCallScreen?: boolean;
  is_in_call?: boolean | null;
  screen?: string | null;
  last_seen_at?: string | null;
  presenceSessionId?: string | null;
  currentSessionId?: string | null;
  effective_status?: string | null;
  /** Last time member was seen in session_members (ms). */
  lastInSessionAt?: number | null;
  previous?: UnifiedMemberStatus | null;
  previousParticipation?: UiParticipationStatus | null;
  fetchFailed?: boolean;
  freshMs?: number;
  nowMs?: number;
  /** Call-only peer / audio hints for strict in_call UI */
  peerState?: CallPeerState;
  effectivePeerState?: EffectivePeerState;
  hasPc?: boolean;
  wasPeerConnected?: boolean;
  audioConfirmedRecently?: boolean;
  lastPlaySuccessAt?: number | null;
};

function parseTs(value?: string | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function presenceGraceMs(): number {
  return isStableVoiceJoinMode()
    ? STABLE_REMOTE_PEER_GRACE_MS
    : PRESENCE_STALE_GRACE_MS;
}

function normalizedEffective(raw?: string | null): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function participationToUnified(
  status: UiParticipationStatus | null | undefined
): UnifiedMemberStatus | null {
  if (status === "in_call") return "in_call";
  if (status === "waiting") return "waiting";
  if (status === "offline") return "offline";
  return null;
}

/** Maps unified UI status to pill color bucket. Connecting is not "in_call" green. */
export function unifiedToParticipation(
  status: UnifiedMemberStatus
): UiParticipationStatus {
  if (status === "in_call") return "in_call";
  if (status === "connecting" || status === "in_session" || status === "waiting") {
    return "waiting";
  }
  return "offline";
}

function buildEvidence(
  input: ResolveMemberStatusInput,
  nowMs: number
): MemberStatusEvidence {
  const lastSeen = parseTs(input.last_seen_at);
  return {
    explicitLeaveSeen:
      input.explicitLeaveSeen === true || input.localExitedCall === true,
    missingFromSessionMembers: !input.inSessionMembers,
    inSessionMembers: input.inSessionMembers,
    presenceOfflineForMs:
      lastSeen != null ? Math.max(0, nowMs - lastSeen) : null,
    peerState: input.peerState ?? null,
    audioConfirmedRecently:
      input.audioConfirmedRecently === true ||
      isRecentPlaySuccess(input.lastPlaySuccessAt, nowMs),
    stableMode: isStableVoiceJoinMode(),
    is_in_call: input.is_in_call,
    screen: String(input.screen ?? "").trim() || null,
  };
}

/** Never preserve in_call across grace without fresh voice evidence in this tick. */
function clampPreservedStatus(status: UnifiedMemberStatus): UnifiedMemberStatus {
  if (status === "in_call") return "in_session";
  return status;
}

function shouldPreservePreviousStatus(
  previous: UnifiedMemberStatus | null | undefined,
  nowMs: number,
  lastInSessionAt: number | null | undefined
): boolean {
  if (!previous || previous === "offline") return false;
  if (previous === "in_call") return false;
  const anchor = lastInSessionAt ?? null;
  if (anchor == null) return false;
  return nowMs - anchor < presenceGraceMs();
}

function hasStrongInCallEvidence(
  input: ResolveMemberStatusInput,
  nowMs: number
): boolean {
  const audioOk =
    input.audioConfirmedRecently === true ||
    isRecentPlaySuccess(input.lastPlaySuccessAt, nowMs);
  const peerConnected =
    input.peerState === "connected" ||
    input.effectivePeerState === "connected" ||
    input.effectivePeerState === "connected_effective";
  return audioOk || peerConnected;
}

function hasConnectingEvidence(input: ResolveMemberStatusInput): boolean {
  return !!(
    input.hasPc ||
    input.peerState === "connecting" ||
    input.wasPeerConnected
  );
}

/**
 * UI display status only. Connection target selection (getRemoteIds / closePeer)
 * uses separate stable-mode logic and must not call this.
 */
export function resolveUnifiedMemberStatus(
  input: ResolveMemberStatusInput
): { status: UnifiedMemberStatus; reason: string; evidence: MemberStatusEvidence } {
  const nowMs = input.nowMs ?? Date.now();
  const freshMs = input.freshMs ?? PRESENCE_FRESH_MS_HOME;
  const evidence = buildEvidence(input, nowMs);
  const screen = String(input.screen ?? "").trim();
  const previous =
    input.previous ?? participationToUnified(input.previousParticipation);
  const stable = isStableVoiceJoinMode();
  const effective = normalizedEffective(input.effective_status);

  if (input.explicitLeaveSeen || input.localExitedCall) {
    return { status: "waiting", reason: "explicit_leave", evidence };
  }

  if (input.isMe && input.viewerOnCallScreen) {
    return { status: "in_call", reason: "self_on_call_screen", evidence };
  }

  if (input.isMe && (input.context === "room" || screen === "room")) {
    return { status: "in_session", reason: "self_in_room", evidence };
  }

  if (!input.inSessionMembers) {
    if (shouldPreservePreviousStatus(previous, nowMs, input.lastInSessionAt)) {
      return {
        status: clampPreservedStatus(previous!),
        reason: "missing_session_grace",
        evidence,
      };
    }
    return {
      status: "offline",
      reason: "missing_from_session_members",
      evidence,
    };
  }

  if (hasStrongInCallEvidence(input, nowMs)) {
    return { status: "in_call", reason: "peer_or_audio_connected", evidence };
  }

  if (hasConnectingEvidence(input)) {
    return { status: "connecting", reason: "peer_connecting", evidence };
  }

  if (screen === "room" || screen === "home" || screen === "offline") {
    if (shouldPreservePreviousStatus(previous, nowMs, input.lastInSessionAt)) {
      return {
        status: clampPreservedStatus(previous!),
        reason: "presence_grace",
        evidence,
      };
    }
    return {
      status: input.context === "room" ? "in_session" : "waiting",
      reason: "screen_room_or_home",
      evidence,
    };
  }

  if (
    screen === "call" &&
    isPresenceFresh(input.last_seen_at, freshMs) &&
    !hasStrongInCallEvidence(input, nowMs)
  ) {
    if (shouldPreservePreviousStatus(previous, nowMs, input.lastInSessionAt)) {
      return {
        status: clampPreservedStatus(previous!),
        reason: "screen_call_grace",
        evidence,
      };
    }
    return {
      status: "in_session",
      reason: "screen_call_no_voice",
      evidence,
    };
  }

  const presenceWouldDowngrade =
    input.is_in_call === false ||
    effective === "waiting" ||
    effective === "room";

  if (stable && input.inSessionMembers && presenceWouldDowngrade) {
    if (shouldPreservePreviousStatus(previous, nowMs, input.lastInSessionAt)) {
      return {
        status: clampPreservedStatus(previous!),
        reason: "stable_presence_grace",
        evidence,
      };
    }
    return {
      status: "in_session",
      reason: "session_member_stable",
      evidence,
    };
  }

  const lastSeen = parseTs(input.last_seen_at);
  const staleButGraceful =
    input.fetchFailed ||
    (lastSeen != null &&
      nowMs - lastSeen <= freshMs + PRESENCE_STALE_GRACE_MS);

  if (staleButGraceful && previous && previous !== "offline") {
    return {
      status: clampPreservedStatus(previous),
      reason: "stale_presence_grace",
      evidence,
    };
  }

  if (input.inSessionMembers) {
    return {
      status: input.context === "room" ? "in_session" : "waiting",
      reason: "session_member_default",
      evidence,
    };
  }

  return { status: "offline", reason: "offline_default", evidence };
}

export function getMemberStatusLabel(
  status: UnifiedMemberStatus,
  context: MemberStatusContext
): string {
  if (status === "in_call") return "通話中";
  if (status === "connecting") {
    return context === "call" ? "接続処理中" : "接続準備中";
  }
  if (status === "in_session") {
    return context === "room" ? "入室中" : "待機中";
  }
  if (status === "waiting") return "待機中";
  return context === "home" ? "オフライン" : "オフライン";
}

export function logMemberStatusDecide(params: {
  context: MemberStatusContext;
  deviceId: string;
  self: boolean;
  screen: string | null;
  inSession: boolean;
  peerState: string | null;
  audioConfirmed: boolean;
  presence: string | null;
  label: string;
  reason: string;
  unified: UnifiedMemberStatus;
}) {
  debugConsoleLog(
    `[member-status] decide member=${String(params.deviceId).slice(-4)} ` +
      `self=${params.self} screen=${params.screen ?? "-"} ` +
      `inSession=${params.inSession} peerState=${params.peerState ?? "-"} ` +
      `audioConfirmed=${params.audioConfirmed} presence=${params.presence ?? "-"} ` +
      `label=${params.label} reason=${params.reason} unified=${params.unified}`
  );
}

export function resolveMemberParticipationForUi(
  input: ResolveMemberStatusInput
): {
  participation: UiParticipationStatus;
  unified: UnifiedMemberStatus;
  label: string;
  reason: string;
  evidence: MemberStatusEvidence;
} {
  const resolved = resolveUnifiedMemberStatus(input);
  const participation = unifiedToParticipation(resolved.status);
  const label = getMemberStatusLabel(resolved.status, input.context);

  logMemberStatusDecide({
    context: input.context,
    deviceId: input.deviceId,
    self: input.isMe === true,
    screen: String(input.screen ?? "").trim() || null,
    inSession: input.inSessionMembers,
    peerState: input.peerState ?? null,
    audioConfirmed: resolved.evidence.audioConfirmedRecently,
    presence: String(input.is_in_call ?? ""),
    label,
    reason: resolved.reason,
    unified: resolved.status,
  });

  return {
    participation,
    unified: resolved.status,
    label,
    reason: resolved.reason,
    evidence: resolved.evidence,
  };
}

export function isExplicitMemberLeave(
  sessionId: string,
  deviceId: string,
  localExitedPeers?: ReadonlySet<string>
): boolean {
  const did = String(deviceId ?? "").trim();
  if (!did) return false;
  if (localExitedPeers?.has(did)) return true;
  return hasLocalLeftCall(sessionId, did);
}
