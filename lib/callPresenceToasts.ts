import {
  deleteMemberNameCache,
  logMemberLeftToast,
  logMemberNameCacheLeave,
  resolveCachedMemberName,
  type MemberNameCache,
} from "@/lib/memberNameCache";

export type CallPresenceEventKind = "join" | "leave";

export type CallPresenceToast = {
  id: string;
  kind: CallPresenceEventKind;
  deviceId: string;
  displayName: string;
  message: string;
  createdAt: number;
};

function resolveToastDisplayName(params: {
  id: string;
  nameById: Map<string, string>;
  nameCache?: MemberNameCache | null;
  forLeave: boolean;
  leaveReason: string;
}): string {
  const fromMap = String(params.nameById.get(params.id) ?? "").trim();
  if (fromMap && fromMap !== "参加者") {
    if (params.forLeave) {
      logMemberNameCacheLeave({
        hit: true,
        userId: params.id,
        memberId: params.id,
        displayName: fromMap,
        leaveReason: params.leaveReason,
      });
    }
    return fromMap;
  }

  const cached = params.nameCache
    ? resolveCachedMemberName(params.nameCache, {
        userId: params.id,
        memberId: params.id,
        deviceId: params.id,
      })
    : null;
  if (cached?.displayName) {
    if (params.forLeave) {
      logMemberNameCacheLeave({
        hit: true,
        userId: cached.userId,
        memberId: cached.memberId,
        displayName: cached.displayName,
        leaveReason: params.leaveReason,
      });
    }
    return cached.displayName;
  }

  if (params.forLeave) {
    logMemberNameCacheLeave({
      hit: false,
      userId: params.id,
      memberId: params.id,
      displayName: "参加者",
      leaveReason: params.leaveReason,
    });
  }
  return fromMap || "参加者";
}

/**
 * Diff in-call member sets and produce join/leave toasts.
 * - Skips until primed (avoids reconnect flood)
 * - Skips self
 * - Dedupes recent identical events
 * - Leave names prefer nameById, then persistent nameCache (set before removal)
 */
export function diffCallPresenceToasts(params: {
  previousIds: Set<string>;
  nextIds: Set<string>;
  primed: boolean;
  selfDeviceId: string;
  nameById: Map<string, string>;
  /** Persistent names remembered while members were known. */
  nameCache?: MemberNameCache | null;
  recentKeys: Set<string>;
  now?: number;
  leaveReason?: string;
  /** When true, prune cache entries after leave toast names are fixed. */
  pruneNameCacheOnLeave?: boolean;
}): {
  primed: boolean;
  nextPreviousIds: Set<string>;
  toasts: CallPresenceToast[];
  nextRecentKeys: Set<string>;
} {
  const now = params.now ?? Date.now();
  const selfId = String(params.selfDeviceId ?? "").trim();
  const nextPreviousIds = new Set(params.nextIds);
  const nextRecentKeys = new Set(params.recentKeys);
  const leaveReason = String(params.leaveReason ?? "left_in_call_set").trim();

  if (!params.primed) {
    return {
      primed: true,
      nextPreviousIds,
      toasts: [],
      nextRecentKeys,
    };
  }

  const toasts: CallPresenceToast[] = [];

  for (const id of params.nextIds) {
    if (!id || id === selfId) continue;
    if (params.previousIds.has(id)) continue;
    const key = `join:${id}`;
    if (nextRecentKeys.has(key)) continue;
    nextRecentKeys.add(key);
    nextRecentKeys.delete(`leave:${id}`);
    const name = resolveToastDisplayName({
      id,
      nameById: params.nameById,
      nameCache: params.nameCache,
      forLeave: false,
      leaveReason,
    });
    toasts.push({
      id: `${key}:${now}`,
      kind: "join",
      deviceId: id,
      displayName: name,
      message: `${name}さんが通話に参加しました`,
      createdAt: now,
    });
  }

  for (const id of params.previousIds) {
    if (!id || id === selfId) continue;
    if (params.nextIds.has(id)) continue;
    const key = `leave:${id}`;
    if (nextRecentKeys.has(key)) continue;
    nextRecentKeys.add(key);
    nextRecentKeys.delete(`join:${id}`);
    // Resolve name before any cache prune / list removal side effects.
    const name = resolveToastDisplayName({
      id,
      nameById: params.nameById,
      nameCache: params.nameCache,
      forLeave: true,
      leaveReason,
    });
    logMemberLeftToast({
      userId: id,
      memberId: id,
      displayName: name,
      leaveReason,
    });
    toasts.push({
      id: `${key}:${now}`,
      kind: "leave",
      deviceId: id,
      displayName: name,
      message: `${name}さんが通話から退出しました`,
      createdAt: now,
    });
    if (params.pruneNameCacheOnLeave && params.nameCache) {
      deleteMemberNameCache(params.nameCache, {
        userId: id,
        memberId: id,
        deviceId: id,
      });
    }
  }

  return {
    primed: true,
    nextPreviousIds,
    toasts,
    nextRecentKeys,
  };
}

export function pruneRecentPresenceKeys(
  keys: Set<string>,
  maxSize = 200
): Set<string> {
  if (keys.size <= maxSize) return keys;
  const arr = Array.from(keys);
  return new Set(arr.slice(arr.length - Math.floor(maxSize / 2)));
}

export function shouldIncludeMemberInCallGrid(params: {
  priority:
    | "explicit_left"
    | "absent_expired"
    | "absent_grace"
    | "presence_stale_expired"
    | "presence_stale_grace"
    | "in_call";
  recentlyDepartedUntilMs: number | null;
  nowMs: number;
  /** When false, presence_stale_grace is treated as left (no grid hold). */
  isInCall?: boolean;
}): boolean {
  // Explicit leave / expired never stay via departed-label grace.
  if (
    params.priority === "explicit_left" ||
    params.priority === "absent_expired" ||
    params.priority === "presence_stale_expired"
  ) {
    return false;
  }

  if (params.priority === "in_call") return true;

  // Short reconnect hold only while still actually in call.
  if (params.priority === "presence_stale_grace") {
    return params.isInCall === true;
  }

  // Absent-from-session brief label window (network drop), not explicit leave.
  if (
    params.priority === "absent_grace" &&
    params.recentlyDepartedUntilMs != null &&
    params.nowMs <= params.recentlyDepartedUntilMs
  ) {
    return true;
  }

  return false;
}
