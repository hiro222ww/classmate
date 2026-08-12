/** Grace before closing peers after transient is_in_call=false or member list drop. */
import { getRemotePeerMemberGraceMs } from "@/lib/stableVoiceJoin";

export const REMOTE_PEER_MEMBER_GRACE_MS = 8_000;

export type RemotePeerGraceRefs = {
  lastStrictInCallAt: Map<string, number>;
  lastSeenInMembersAt: Map<string, number>;
  explicitRemoved: Set<string>;
};

export function createRemotePeerGraceRefs(): RemotePeerGraceRefs {
  return {
    lastStrictInCallAt: new Map(),
    lastSeenInMembersAt: new Map(),
    explicitRemoved: new Set(),
  };
}

export function markStrictRemotePeersInCall(
  refs: RemotePeerGraceRefs,
  strictRemoteIds: string[],
  nowMs = Date.now()
) {
  for (const id of strictRemoteIds) {
    if (!id) continue;
    refs.lastStrictInCallAt.set(id, nowMs);
    refs.lastSeenInMembersAt.set(id, nowMs);
    refs.explicitRemoved.delete(id);
  }
}

export function markSessionMemberRemoteIds(
  refs: RemotePeerGraceRefs,
  sessionMemberRemoteIds: string[],
  nowMs = Date.now()
) {
  for (const id of sessionMemberRemoteIds) {
    if (!id) continue;
    // Track membership sightings only. Do not refresh lastStrictInCallAt here —
    // that was extending "再接続中" for session members who already left /call.
    refs.lastSeenInMembersAt.set(id, nowMs);
  }
}

export function markRemotePeerExplicitRemoved(
  refs: RemotePeerGraceRefs,
  remoteId: string
) {
  const id = String(remoteId ?? "").trim();
  if (!id) return;
  refs.explicitRemoved.add(id);
  refs.lastStrictInCallAt.delete(id);
  refs.lastSeenInMembersAt.delete(id);
}

export function pruneRemotePeerGraceRefs(
  refs: RemotePeerGraceRefs,
  nowMs = Date.now()
) {
  const maxAge = getRemotePeerMemberGraceMs() * 4;
  for (const [id, lastAt] of refs.lastStrictInCallAt.entries()) {
    if (nowMs - lastAt > maxAge) {
      refs.lastStrictInCallAt.delete(id);
    }
  }
  for (const [id, lastAt] of refs.lastSeenInMembersAt.entries()) {
    if (nowMs - lastAt > maxAge) {
      refs.lastSeenInMembersAt.delete(id);
    }
  }
}

export function getRemoteIdsWithMemberGrace(
  strictRemoteIds: string[],
  refs: RemotePeerGraceRefs,
  nowMs = Date.now(),
  sessionMemberRemoteIds?: string[]
): { ids: string[]; graceIds: string[]; strictIds: string[] } {
  markStrictRemotePeersInCall(refs, strictRemoteIds, nowMs);

  if (sessionMemberRemoteIds?.length) {
    markSessionMemberRemoteIds(refs, sessionMemberRemoteIds, nowMs);
  }

  pruneRemotePeerGraceRefs(refs, nowMs);

  const graceMs = getRemotePeerMemberGraceMs();
  const merged = new Set(strictRemoteIds);
  const graceIds: string[] = [];

  // Keep brief grace only for peers that were recently call-active (ICE/presence lag).
  // Do not pull in every session_member — that keeps exited classmates in remoteIds.
  for (const [id, lastAt] of refs.lastStrictInCallAt.entries()) {
    if (refs.explicitRemoved.has(id)) continue;
    if (merged.has(id)) continue;
    if (nowMs - lastAt < graceMs) {
      merged.add(id);
      graceIds.push(id);
    }
  }

  return {
    ids: Array.from(merged),
    graceIds,
    strictIds: strictRemoteIds,
  };
}

export function shouldCloseRemotePeerNow(
  remoteId: string,
  strictRemoteIds: string[],
  refs: RemotePeerGraceRefs,
  nowMs = Date.now()
): {
  closeNow: boolean;
  graceRemainingMs: number;
  via:
    | "explicit"
    | "grace_expired"
    | "grace_active"
    | "never_in_call"
    | "session_member_grace";
} {
  const id = String(remoteId ?? "").trim();
  const graceMs = getRemotePeerMemberGraceMs();

  if (!id) {
    return { closeNow: true, graceRemainingMs: 0, via: "never_in_call" };
  }

  if (refs.explicitRemoved.has(id)) {
    return { closeNow: true, graceRemainingMs: 0, via: "explicit" };
  }

  if (strictRemoteIds.includes(id)) {
    return { closeNow: false, graceRemainingMs: 0, via: "grace_active" };
  }

  const lastMembersAt = refs.lastSeenInMembersAt.get(id);
  if (lastMembersAt != null) {
    const remaining = graceMs - (nowMs - lastMembersAt);
    if (remaining > 0) {
      return {
        closeNow: false,
        graceRemainingMs: remaining,
        via: "session_member_grace",
      };
    }
  }

  const lastAt = refs.lastStrictInCallAt.get(id);
  if (lastAt == null) {
    return { closeNow: true, graceRemainingMs: 0, via: "never_in_call" };
  }

  const elapsed = nowMs - lastAt;
  const remaining = graceMs - elapsed;
  if (remaining > 0) {
    return { closeNow: false, graceRemainingMs: remaining, via: "grace_active" };
  }

  return { closeNow: true, graceRemainingMs: 0, via: "grace_expired" };
}

/** Presence-confirmed room/home/offline leave — close voice peer promptly. */
export function isPresenceConfirmedRemoteLeave(member: {
  is_in_call?: boolean;
  screen?: string | null;
  last_seen_at?: string | null;
}): boolean {
  if (member.is_in_call === true) return false;
  const screen = String(member.screen ?? "").trim();
  if (screen !== "room" && screen !== "offline" && screen !== "home") {
    return false;
  }
  const lastSeen = String(member.last_seen_at ?? "").trim();
  if (!lastSeen) {
    // Fresh member payload without last_seen still counts as left /call.
    return true;
  }
  const t = new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t < 60_000;
}

export type PresenceLeaveCleanupSkipReason =
  | "not_presence_leave"
  | "join_transition_hold"
  | "live_peer_evidence"
  | "recent_strict_in_call";

/**
 * Gate presence→explicit_removed / peer cleanup.
 * Leave signals still bypass this (handled separately).
 * Protects late joiners in join_transition and established live peers
 * from brief presence / session_members flicker.
 */
export function shouldApplyPresenceConfirmedLeaveCleanup(params: {
  isPresenceLeave: boolean;
  nowMs: number;
  joinTransitionSinceMs: number | null;
  joinTransitionGraceMs: number;
  lastStrictInCallAt: number | null;
  recentStrictGraceMs: number;
  hasLivePeerEvidence: boolean;
}): { apply: boolean; skipReason?: PresenceLeaveCleanupSkipReason } {
  if (!params.isPresenceLeave) {
    return { apply: false, skipReason: "not_presence_leave" };
  }

  if (params.hasLivePeerEvidence) {
    return { apply: false, skipReason: "live_peer_evidence" };
  }

  if (params.joinTransitionSinceMs != null) {
    const elapsed = params.nowMs - params.joinTransitionSinceMs;
    if (elapsed >= 0 && elapsed < params.joinTransitionGraceMs) {
      return { apply: false, skipReason: "join_transition_hold" };
    }
  }

  if (params.lastStrictInCallAt != null) {
    const elapsed = params.nowMs - params.lastStrictInCallAt;
    if (elapsed >= 0 && elapsed < params.recentStrictGraceMs) {
      return { apply: false, skipReason: "recent_strict_in_call" };
    }
  }

  return { apply: true };
}

/**
 * When the member list grows (late joiner), only the new remote should be
 * forced into ensure/offer. Established healthy peers must not be reset.
 */
export function shouldEnsurePeerOnMemberListChange(params: {
  isNewlyJoinedRemote: boolean;
  hasUsablePc: boolean;
  isEstablishedHealthy: boolean;
}): boolean {
  if (params.isEstablishedHealthy && !params.isNewlyJoinedRemote) {
    return false;
  }
  if (params.isNewlyJoinedRemote) return true;
  return !params.hasUsablePc;
}

/** Suppress voiceEpoch-driven peer reset for already-healthy peers (presence flicker). */
export function shouldSuppressVoiceEpochResetForHealthyPeer(params: {
  isEstablishedHealthy: boolean;
}): boolean {
  return params.isEstablishedHealthy;
}

export function getClosePeerEvidence(
  remoteId: string,
  refs: RemotePeerGraceRefs,
  members: Array<{
    device_id?: string | null;
    is_in_call?: boolean;
    screen?: string | null;
    last_seen_at?: string | null;
  }>
) {
  const id = String(remoteId ?? "").trim();
  const member = members.find((m) => String(m.device_id ?? "").trim() === id);
  const lastMembersAt = refs.lastSeenInMembersAt.get(id);
  const now = Date.now();
  return {
    explicitLeaveSignalSeen: refs.explicitRemoved.has(id),
    missingForMs:
      lastMembersAt != null ? Math.max(0, now - lastMembersAt) : null,
    lastSeenInMembersAt: lastMembersAt ?? null,
    lastPresenceState: member
      ? `inCall=${member.is_in_call === true} screen=${String(member.screen ?? "-")}`
      : "not_in_member_list",
    visibilityState:
      typeof document !== "undefined" ? document.visibilityState : "-",
  };
}
