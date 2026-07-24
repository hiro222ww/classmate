export type CallPresenceEventKind = "join" | "leave";

export type CallPresenceToast = {
  id: string;
  kind: CallPresenceEventKind;
  deviceId: string;
  displayName: string;
  message: string;
  createdAt: number;
};

/**
 * Diff in-call member sets and produce join/leave toasts.
 * - Skips until primed (avoids reconnect flood)
 * - Skips self
 * - Dedupes recent identical events
 */
export function diffCallPresenceToasts(params: {
  previousIds: Set<string>;
  nextIds: Set<string>;
  primed: boolean;
  selfDeviceId: string;
  nameById: Map<string, string>;
  recentKeys: Set<string>;
  now?: number;
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
    const name = params.nameById.get(id) || "参加者";
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
    const name = params.nameById.get(id) || "参加者";
    toasts.push({
      id: `${key}:${now}`,
      kind: "leave",
      deviceId: id,
      displayName: name,
      message: `${name}さんが通話から退出しました`,
      createdAt: now,
    });
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
}): boolean {
  if (
    params.recentlyDepartedUntilMs != null &&
    params.nowMs <= params.recentlyDepartedUntilMs
  ) {
    return true;
  }
  return (
    params.priority === "in_call" ||
    params.priority === "presence_stale_grace"
  );
}
