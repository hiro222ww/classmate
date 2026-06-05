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

/** Unified status ladder (Home / Room / Call). */
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
  /** Call-only peer / audio hints */
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

export function unifiedToParticipation(
  status: UnifiedMemberStatus
): UiParticipationStatus {
  if (status === "in_call" || status === "connecting") return "in_call";
  if (status === "in_session" || status === "waiting") return "waiting";
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
    audioConfirmedRecently: input.audioConfirmedRecently === true,
    stableMode: isStableVoiceJoinMode(),
    is_in_call: input.is_in_call,
    screen: String(input.screen ?? "").trim() || null,
  };
}

function shouldPreservePreviousStatus(
  previous: UnifiedMemberStatus | null | undefined,
  nowMs: number,
  lastInSessionAt: number | null | undefined
): boolean {
  if (!previous || previous === "offline") return false;
  const anchor = lastInSessionAt ?? null;
  if (anchor == null) return false;
  return nowMs - anchor < presenceGraceMs();
}

export function resolveUnifiedMemberStatus(
  input: ResolveMemberStatusInput
): { status: UnifiedMemberStatus; reason: string; evidence: MemberStatusEvidence } {
  const nowMs = input.nowMs ?? Date.now();
  const stable = isStableVoiceJoinMode();
  const freshMs = input.freshMs ?? PRESENCE_FRESH_MS_HOME;
  const evidence = buildEvidence(input, nowMs);
  const screen = String(input.screen ?? "").trim();
  const previous = input.previous ?? participationToUnified(input.previousParticipation);

  if (input.explicitLeaveSeen || input.localExitedCall) {
    return { status: "waiting", reason: "explicit_leave", evidence };
  }

  if (!input.inSessionMembers) {
    if (shouldPreservePreviousStatus(previous, nowMs, input.lastInSessionAt)) {
      return {
        status: previous!,
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

  if (input.context === "call") {
    const audioOk =
      input.audioConfirmedRecently === true ||
      isRecentPlaySuccess(input.lastPlaySuccessAt, nowMs);
    const peerConnected =
      input.peerState === "connected" ||
      input.effectivePeerState === "connected" ||
      input.effectivePeerState === "connected_effective";

    if (audioOk || peerConnected) {
      return { status: "in_call", reason: "peer_or_audio_connected", evidence };
    }

    if (
      input.hasPc ||
      input.peerState === "connecting" ||
      input.wasPeerConnected
    ) {
      return { status: "connecting", reason: "peer_connecting", evidence };
    }
  }

  if (input.is_in_call === true) {
    const sid = String(input.presenceSessionId ?? "").trim();
    const currentSid = String(input.currentSessionId ?? "").trim();
    if (!currentSid || !sid || sid === currentSid) {
      return { status: "in_call", reason: "is_in_call_true", evidence };
    }
  }

  if (
    isPresenceFresh(input.last_seen_at, freshMs) &&
    screen === "call"
  ) {
    const sid = String(input.presenceSessionId ?? "").trim();
    const currentSid = String(input.currentSessionId ?? "").trim();
    if (!currentSid || !sid || sid === currentSid) {
      return { status: "in_call", reason: "screen_call_fresh", evidence };
    }
  }

  const effective = normalizedEffective(input.effective_status);
  if (
    isPresenceFresh(input.last_seen_at, freshMs) &&
    (effective === "calling" ||
      effective === "call" ||
      effective === "active")
  ) {
    const sid = String(input.presenceSessionId ?? "").trim();
    const currentSid = String(input.currentSessionId ?? "").trim();
    if (!currentSid || !sid || sid === currentSid) {
      return { status: "in_call", reason: "effective_in_call", evidence };
    }
  }

  const presenceWouldDowngrade =
    input.is_in_call === false ||
    screen === "room" ||
    screen === "home" ||
    screen === "offline" ||
    effective === "waiting" ||
    effective === "room";

  if (stable && input.inSessionMembers && presenceWouldDowngrade) {
    if (shouldPreservePreviousStatus(previous, nowMs, input.lastInSessionAt)) {
      return {
        status: previous!,
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

  if (!stable) {
    if (screen === "room" || screen === "home") {
      if (
        shouldPreservePreviousStatus(previous, nowMs, input.lastInSessionAt)
      ) {
        return { status: previous!, reason: "presence_grace", evidence };
      }
      return { status: "waiting", reason: "screen_home_or_room", evidence };
    }

    if (input.is_in_call === false) {
      if (
        shouldPreservePreviousStatus(previous, nowMs, input.lastInSessionAt)
      ) {
        return { status: previous!, reason: "presence_grace", evidence };
      }
      return { status: "waiting", reason: "is_in_call_false", evidence };
    }
  }

  if (
    (input.fetchFailed ||
      (parseTs(input.last_seen_at) != null &&
        nowMs - (parseTs(input.last_seen_at) ?? 0) <=
          freshMs + PRESENCE_STALE_GRACE_MS)) &&
    previous &&
    previous !== "offline"
  ) {
    return { status: previous, reason: "stale_presence_grace", evidence };
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

export function logMemberStatusDowngrade(params: {
  context: MemberStatusContext;
  deviceId: string;
  to: UnifiedMemberStatus;
  from: UnifiedMemberStatus | null;
  reason: string;
  evidence: MemberStatusEvidence;
}) {
  debugConsoleLog(
    `[member-status] downgrade to=${params.to} from=${params.from ?? "-"} ` +
      `reason=${params.reason} member=${String(params.deviceId).slice(-4)} ` +
      `evidence=${JSON.stringify(params.evidence)}`
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

  const prevUnified =
    input.previous ??
    participationToUnified(input.previousParticipation);
  const downgraded =
    prevUnified != null &&
    rankStatus(resolved.status) < rankStatus(prevUnified);
  if (downgraded) {
    logMemberStatusDowngrade({
      context: input.context,
      deviceId: input.deviceId,
      to: resolved.status,
      from: prevUnified,
      reason: resolved.reason,
      evidence: resolved.evidence,
    });
  }

  return {
    participation,
    unified: resolved.status,
    label,
    reason: resolved.reason,
    evidence: resolved.evidence,
  };
}

function rankStatus(status: UnifiedMemberStatus): number {
  switch (status) {
    case "in_call":
      return 5;
    case "connecting":
      return 4;
    case "in_session":
      return 3;
    case "waiting":
      return 2;
    default:
      return 1;
  }
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
