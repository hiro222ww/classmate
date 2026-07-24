export type MemberJoinEvent = {
  id: string;
  deviceId: string;
  displayName: string;
  message: string;
  createdAt: number;
};

/**
 * Diff member ID sets for join banners.
 * - First prime: no events (avoids treating initial load as joins)
 * - Soft resync: pass softResync=true to update baseline without events
 */
export function diffMemberJoinEvents(params: {
  previousIds: Set<string>;
  nextIds: Set<string>;
  primed: boolean;
  selfDeviceId: string;
  nameById: Map<string, string>;
  recentKeys: Set<string>;
  softResync?: boolean;
  now?: number;
}): {
  primed: boolean;
  nextPreviousIds: Set<string>;
  events: MemberJoinEvent[];
  nextRecentKeys: Set<string>;
} {
  const now = params.now ?? Date.now();
  const selfId = String(params.selfDeviceId ?? "").trim();
  const nextPreviousIds = new Set(params.nextIds);
  const nextRecentKeys = new Set(params.recentKeys);

  if (!params.primed || params.softResync) {
    return {
      primed: true,
      nextPreviousIds,
      events: [],
      nextRecentKeys,
    };
  }

  const events: MemberJoinEvent[] = [];
  for (const id of params.nextIds) {
    if (!id || id === selfId) continue;
    if (params.previousIds.has(id)) continue;
    const key = `join:${id}`;
    if (nextRecentKeys.has(key)) continue;
    nextRecentKeys.add(key);
    const name = params.nameById.get(id) || "参加者";
    events.push({
      id: `${key}:${now}`,
      deviceId: id,
      displayName: name,
      message: `🎉 ${name}さんがクラスに参加しました！`,
      createdAt: now,
    });
  }

  return {
    primed: true,
    nextPreviousIds,
    events,
    nextRecentKeys,
  };
}

export function pruneRecentJoinKeys(keys: Set<string>, maxSize = 200): Set<string> {
  if (keys.size <= maxSize) return keys;
  const arr = Array.from(keys);
  return new Set(arr.slice(arr.length - Math.floor(maxSize / 2)));
}
