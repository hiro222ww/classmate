/**
 * Persistent display-name cache for join/leave toasts.
 * Keyed by device/member id (the id used in presence events).
 */

export type MemberNameCacheEntry = {
  displayName: string;
  userId: string;
  memberId: string;
};

export type MemberNameCache = Map<string, MemberNameCacheEntry>;

function compactId(value: string): string {
  const id = String(value ?? "").trim();
  if (!id) return "-";
  return id.length <= 8 ? id : id.slice(-8);
}

export function isUsableMemberDisplayName(name: string | null | undefined): boolean {
  const trimmed = String(name ?? "").trim();
  return !!trimmed && trimmed !== "参加者";
}

export function setMemberNameCache(
  cache: MemberNameCache,
  params: {
    userId?: string | null;
    memberId?: string | null;
    deviceId?: string | null;
    displayName: string | null | undefined;
  }
): MemberNameCacheEntry | null {
  const memberId = String(
    params.memberId ?? params.deviceId ?? params.userId ?? ""
  ).trim();
  const userId = String(params.userId ?? memberId).trim();
  const displayName = String(params.displayName ?? "").trim();
  if (!memberId || !isUsableMemberDisplayName(displayName)) return null;

  const entry: MemberNameCacheEntry = {
    displayName,
    userId: userId || memberId,
    memberId,
  };
  const previous = cache.get(memberId);
  const unchanged =
    previous?.displayName === entry.displayName &&
    previous?.userId === entry.userId &&
    previous?.memberId === entry.memberId;
  cache.set(memberId, entry);
  if (userId && userId !== memberId) {
    cache.set(userId, entry);
  }

  if (!unchanged) {
    console.log(
      `[member-name-cache-set] userId=${compactId(entry.userId)} ` +
        `memberId=${compactId(entry.memberId)} displayName=${entry.displayName}`
    );
  }
  return entry;
}

export function resolveCachedMemberName(
  cache: MemberNameCache,
  params: {
    userId?: string | null;
    memberId?: string | null;
    deviceId?: string | null;
  }
): MemberNameCacheEntry | null {
  const memberId = String(
    params.memberId ?? params.deviceId ?? ""
  ).trim();
  const userId = String(params.userId ?? "").trim();
  if (userId && cache.has(userId)) return cache.get(userId) ?? null;
  if (memberId && cache.has(memberId)) return cache.get(memberId) ?? null;
  return null;
}

export function deleteMemberNameCache(
  cache: MemberNameCache,
  params: {
    userId?: string | null;
    memberId?: string | null;
    deviceId?: string | null;
  }
) {
  const memberId = String(
    params.memberId ?? params.deviceId ?? ""
  ).trim();
  const userId = String(params.userId ?? "").trim();
  const entry = resolveCachedMemberName(cache, params);
  if (entry) {
    cache.delete(entry.memberId);
    cache.delete(entry.userId);
  }
  if (memberId) cache.delete(memberId);
  if (userId) cache.delete(userId);
}

export function logMemberNameCacheLeave(params: {
  hit: boolean;
  userId?: string | null;
  memberId?: string | null;
  displayName: string;
  leaveReason: string;
}) {
  const userId = compactId(String(params.userId ?? params.memberId ?? ""));
  const memberId = compactId(String(params.memberId ?? ""));
  const event = params.hit
    ? "member-name-cache-hit-on-leave"
    : "member-name-cache-miss-on-leave";
  console.log(
    `[${event}] userId=${userId} memberId=${memberId} ` +
      `displayName=${params.displayName} leaveReason=${params.leaveReason}`
  );
}

export function logMemberLeftToast(params: {
  userId?: string | null;
  memberId?: string | null;
  displayName: string;
  leaveReason: string;
}) {
  console.log(
    `[member-left-toast] userId=${compactId(String(params.userId ?? params.memberId ?? ""))} ` +
      `memberId=${compactId(String(params.memberId ?? ""))} ` +
      `displayName=${params.displayName} leaveReason=${params.leaveReason}`
  );
}
