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
  type UiParticipationStatus,
} from "@/lib/memberPresenceStatus";

export type MemberStatusContext = "home" | "room" | "call";

/** UI-only internal ladder. Not used for voice connection targets. */
export type InternalMemberStatus =
  | "in_voice"
  | "connecting_voice"
  | "in_room"
  | "in_session"
  | "member_only"
  | "offline";

/** Legacy unified bucket for pill mapping. */
export type UnifiedMemberStatus =
  | "in_call"
  | "connecting"
  | "in_session"
  | "in_room"
  | "member_only"
  | "offline";

export type MemberStatusEvidence = {
  explicitLeaveSeen: boolean;
  inSessionMembers: boolean;
  inClassMembership: boolean;
  freshPresence: boolean;
  stalePresence: boolean;
  presenceOfflineForMs: number | null;
  peerState: string | null;
  audioConfirmedRecently: boolean;
  screen: string | null;
};

export type ResolveMemberStatusInput = {
  context: MemberStatusContext;
  deviceId: string;
  inSessionMembers: boolean;
  inClassMembership?: boolean;
  explicitLeaveSeen?: boolean;
  localExitedCall?: boolean;
  isMe?: boolean;
  viewerOnCallScreen?: boolean;
  is_in_call?: boolean | null;
  screen?: string | null;
  last_seen_at?: string | null;
  presenceSessionId?: string | null;
  currentSessionId?: string | null;
  effective_status?: string | null;
  lastInSessionAt?: number | null;
  previousInternal?: InternalMemberStatus | null;
  previous?: UnifiedMemberStatus | null;
  previousParticipation?: UiParticipationStatus | null;
  fetchFailed?: boolean;
  freshMs?: number;
  nowMs?: number;
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

function voiceUiGraceMs(): number {
  return isStableVoiceJoinMode()
    ? STABLE_REMOTE_PEER_GRACE_MS
    : 15_000;
}

export function sanitizePresenceForUi<T extends {
  is_in_call?: boolean | null;
  screen?: string | null;
  last_seen_at?: string | null;
  effective_status?: string | null;
  status?: string | null;
}>(source: T, freshMs: number): T {
  if (isPresenceFresh(source.last_seen_at, freshMs)) {
    return source;
  }
  return {
    ...source,
    is_in_call: false,
    screen: null,
    effective_status: null,
    status: null,
  };
}

export function participationToUnified(
  status: UiParticipationStatus | null | undefined
): UnifiedMemberStatus | null {
  if (status === "in_call") return "in_call";
  if (status === "waiting") return "in_session";
  if (status === "offline") return "offline";
  return null;
}

export function internalToUnified(
  status: InternalMemberStatus
): UnifiedMemberStatus {
  if (status === "in_voice") return "in_call";
  if (status === "connecting_voice") return "connecting";
  if (status === "in_room") return "in_room";
  if (status === "in_session") return "in_session";
  if (status === "member_only") return "member_only";
  return "offline";
}

export function unifiedToParticipation(
  status: UnifiedMemberStatus
): UiParticipationStatus {
  if (status === "in_call") return "in_call";
  if (
    status === "connecting" ||
    status === "in_session" ||
    status === "in_room"
  ) {
    return "waiting";
  }
  return "offline";
}

function buildEvidence(
  input: ResolveMemberStatusInput,
  nowMs: number,
  fresh: boolean,
  stale: boolean
): MemberStatusEvidence {
  const lastSeen = parseTs(input.last_seen_at);
  return {
    explicitLeaveSeen:
      input.explicitLeaveSeen === true || input.localExitedCall === true,
    inSessionMembers: input.inSessionMembers,
    inClassMembership: input.inClassMembership === true,
    freshPresence: fresh,
    stalePresence: stale,
    presenceOfflineForMs:
      lastSeen != null ? Math.max(0, nowMs - lastSeen) : null,
    peerState: input.peerState ?? null,
    audioConfirmedRecently:
      input.audioConfirmedRecently === true ||
      isRecentPlaySuccess(input.lastPlaySuccessAt, nowMs),
    screen: fresh ? String(input.screen ?? "").trim() || null : null,
  };
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

function shouldPreserveVoiceUiStatus(
  previous: InternalMemberStatus,
  input: ResolveMemberStatusInput,
  nowMs: number
): boolean {
  if (previous !== "in_voice" && previous !== "connecting_voice") {
    return false;
  }
  if (input.context !== "call") return false;
  if (
    hasStrongInCallEvidence(input, nowMs) ||
    hasConnectingEvidence(input)
  ) {
    return true;
  }
  const anchor = input.lastInSessionAt ?? null;
  if (anchor == null) return false;
  return nowMs - anchor < voiceUiGraceMs();
}

/**
 * UI display only. Voice connection (getRemoteIds / closePeer) must not call this.
 */
export function resolveInternalMemberStatus(
  input: ResolveMemberStatusInput
): {
  internal: InternalMemberStatus;
  reason: string;
  evidence: MemberStatusEvidence;
} {
  const nowMs = input.nowMs ?? Date.now();
  const freshMs = input.freshMs ?? PRESENCE_FRESH_MS_HOME;
  const fresh = isPresenceFresh(input.last_seen_at, freshMs);
  const stale = parseTs(input.last_seen_at) != null && !fresh;
  const freshScreen = fresh ? String(input.screen ?? "").trim() : "";
  const evidence = buildEvidence(input, nowMs, fresh, stale);
  const previousInternal = input.previousInternal ?? null;

  if (input.explicitLeaveSeen || input.localExitedCall) {
    return { internal: "in_room", reason: "explicit_leave", evidence };
  }

  if (input.isMe && input.viewerOnCallScreen && input.context === "call") {
    return { internal: "in_voice", reason: "self_on_call_screen", evidence };
  }

  if (hasStrongInCallEvidence(input, nowMs)) {
    return { internal: "in_voice", reason: "voice_connected", evidence };
  }

  if (hasConnectingEvidence(input) && input.context === "call") {
    return {
      internal: "connecting_voice",
      reason: "voice_connecting",
      evidence,
    };
  }

  if (
    previousInternal &&
    shouldPreserveVoiceUiStatus(previousInternal, input, nowMs)
  ) {
    return {
      internal: previousInternal,
      reason: "voice_ui_presence_grace",
      evidence,
    };
  }

  if (input.isMe && input.context === "room") {
    return { internal: "in_room", reason: "self_in_room", evidence };
  }

  if (fresh && freshScreen === "room") {
    return { internal: "in_room", reason: "fresh_presence_room", evidence };
  }

  if (fresh && freshScreen === "call") {
    if (input.context === "call") {
      return {
        internal: "connecting_voice",
        reason: "fresh_call_screen_connecting",
        evidence,
      };
    }
    if (input.inSessionMembers) {
      return {
        internal: "in_session",
        reason: "fresh_call_screen_auxiliary",
        evidence,
      };
    }
  }

  if (input.inSessionMembers) {
    return {
      internal: "in_session",
      reason: "session_member_no_fresh_room_presence",
      evidence,
    };
  }

  if (input.inClassMembership) {
    return { internal: "member_only", reason: "class_member_only", evidence };
  }

  return { internal: "offline", reason: "offline", evidence };
}

export function getMemberStatusLabel(
  internal: InternalMemberStatus,
  context: MemberStatusContext,
  opts?: { isMe?: boolean }
): string {
  const isMe = opts?.isMe === true;

  if (internal === "in_voice") return "通話中";
  if (internal === "connecting_voice") {
    return context === "call" ? "接続処理中" : "接続中";
  }
  if (internal === "in_room") {
    if (isMe && context === "room") return "入室中";
    return "待機中";
  }
  if (internal === "in_session") {
    if (context === "room") return "入室中";
    if (context === "call") return "接続準備中";
    return "入室中";
  }
  if (internal === "member_only") return "所属中";
  return "オフライン";
}

export function logMemberStatusDecide(params: {
  context: MemberStatusContext;
  deviceId: string;
  self: boolean;
  freshPresence: boolean;
  stale: boolean;
  screen: string | null;
  inSession: boolean;
  peerState: string | null;
  audioConfirmed: boolean;
  internalStatus: InternalMemberStatus;
  label: string;
  reason: string;
}) {
  debugConsoleLog(
    `[member-status] decide context=${params.context} ` +
      `member=${String(params.deviceId).slice(-4)} self=${params.self} ` +
      `freshPresence=${params.freshPresence} stale=${params.stale} ` +
      `screen=${params.screen ?? "-"} inSession=${params.inSession} ` +
      `peerState=${params.peerState ?? "-"} audioConfirmed=${params.audioConfirmed} ` +
      `internalStatus=${params.internalStatus} label=${params.label} ` +
      `reason=${params.reason}`
  );
}

export function resolveMemberParticipationForUi(
  input: ResolveMemberStatusInput
): {
  participation: UiParticipationStatus;
  unified: UnifiedMemberStatus;
  internal: InternalMemberStatus;
  label: string;
  reason: string;
  evidence: MemberStatusEvidence;
} {
  const resolved = resolveInternalMemberStatus(input);
  const unified = internalToUnified(resolved.internal);
  const participation = unifiedToParticipation(unified);
  const label = getMemberStatusLabel(resolved.internal, input.context, {
    isMe: input.isMe,
  });

  logMemberStatusDecide({
    context: input.context,
    deviceId: input.deviceId,
    self: input.isMe === true,
    freshPresence: resolved.evidence.freshPresence,
    stale: resolved.evidence.stalePresence,
    screen: resolved.evidence.screen,
    inSession: input.inSessionMembers,
    peerState: input.peerState ?? null,
    audioConfirmed: resolved.evidence.audioConfirmedRecently,
    internalStatus: resolved.internal,
    label,
    reason: resolved.reason,
  });

  return {
    participation,
    unified,
    internal: resolved.internal,
    label,
    reason: resolved.reason,
    evidence: resolved.evidence,
  };
}

/** @deprecated Use resolveInternalMemberStatus */
export function resolveUnifiedMemberStatus(
  input: ResolveMemberStatusInput
): {
  status: UnifiedMemberStatus;
  reason: string;
  evidence: MemberStatusEvidence;
} {
  const resolved = resolveInternalMemberStatus(input);
  return {
    status: internalToUnified(resolved.internal),
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
