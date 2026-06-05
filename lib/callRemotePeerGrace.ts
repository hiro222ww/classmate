/** Grace before closing peers after transient is_in_call=false or member list drop. */
export const REMOTE_PEER_MEMBER_GRACE_MS = 8_000;

export type RemotePeerGraceRefs = {
  lastStrictInCallAt: Map<string, number>;
  explicitRemoved: Set<string>;
};

export function createRemotePeerGraceRefs(): RemotePeerGraceRefs {
  return {
    lastStrictInCallAt: new Map(),
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
    refs.explicitRemoved.delete(id);
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
}

export function pruneRemotePeerGraceRefs(
  refs: RemotePeerGraceRefs,
  nowMs = Date.now()
) {
  const maxAge = REMOTE_PEER_MEMBER_GRACE_MS * 4;
  for (const [id, lastAt] of refs.lastStrictInCallAt.entries()) {
    if (nowMs - lastAt > maxAge) {
      refs.lastStrictInCallAt.delete(id);
    }
  }
}

export function getRemoteIdsWithMemberGrace(
  strictRemoteIds: string[],
  refs: RemotePeerGraceRefs,
  nowMs = Date.now()
): { ids: string[]; graceIds: string[]; strictIds: string[] } {
  markStrictRemotePeersInCall(refs, strictRemoteIds, nowMs);
  pruneRemotePeerGraceRefs(refs, nowMs);

  const merged = new Set(strictRemoteIds);
  const graceIds: string[] = [];

  for (const [id, lastAt] of refs.lastStrictInCallAt.entries()) {
    if (refs.explicitRemoved.has(id)) continue;
    if (merged.has(id)) continue;
    if (nowMs - lastAt < REMOTE_PEER_MEMBER_GRACE_MS) {
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
): { closeNow: boolean; graceRemainingMs: number; via: "explicit" | "grace_expired" | "grace_active" | "never_in_call" } {
  const id = String(remoteId ?? "").trim();
  if (!id) {
    return { closeNow: true, graceRemainingMs: 0, via: "never_in_call" };
  }

  if (refs.explicitRemoved.has(id)) {
    return { closeNow: true, graceRemainingMs: 0, via: "explicit" };
  }

  if (strictRemoteIds.includes(id)) {
    return { closeNow: false, graceRemainingMs: 0, via: "grace_active" };
  }

  const lastAt = refs.lastStrictInCallAt.get(id);
  if (lastAt == null) {
    return { closeNow: true, graceRemainingMs: 0, via: "never_in_call" };
  }

  const elapsed = nowMs - lastAt;
  const remaining = REMOTE_PEER_MEMBER_GRACE_MS - elapsed;
  if (remaining > 0) {
    return { closeNow: false, graceRemainingMs: remaining, via: "grace_active" };
  }

  return { closeNow: true, graceRemainingMs: 0, via: "grace_expired" };
}

/** Presence-confirmed room/offline while not in call → immediate peer drop. */
export function isPresenceConfirmedRemoteLeave(member: {
  is_in_call?: boolean;
  screen?: string | null;
  last_seen_at?: string | null;
}): boolean {
  if (member.is_in_call === true) return false;
  const screen = String(member.screen ?? "").trim();
  if (screen !== "room" && screen !== "offline") return false;
  const lastSeen = String(member.last_seen_at ?? "").trim();
  if (!lastSeen) return false;
  const t = new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 20_000;
}
