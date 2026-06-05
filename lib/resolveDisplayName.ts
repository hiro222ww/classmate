import { debugConsoleLog } from "@/lib/debugVoiceLog";

export const DISPLAY_NAME_FALLBACK = "参加者";

const PLACEHOLDER_DISPLAY_NAMES = new Set([
  "参加者",
  "メンバー",
  "ななし",
  "you",
  "guest",
  "ゲスト",
  "クラスメート",
]);

export type DisplayNameSource =
  | "user_profile"
  | "session_member"
  | "class_presence"
  | "fallback";

export type ResolveDisplayNameInput = {
  profileDisplayName?: unknown;
  sessionMemberDisplayName?: unknown;
  presenceDisplayName?: unknown;
};

export type ResolvedDisplayName = {
  displayName: string;
  source: DisplayNameSource;
};

export function normalizeDisplayNameInput(v: unknown): string {
  return String(v ?? "").trim();
}

export function isUsableDisplayName(v: unknown): boolean {
  const normalized = normalizeDisplayNameInput(v);
  if (!normalized) return false;
  return !PLACEHOLDER_DISPLAY_NAMES.has(normalized.toLowerCase());
}

export function resolveDisplayName(
  input: ResolveDisplayNameInput
): ResolvedDisplayName {
  if (isUsableDisplayName(input.profileDisplayName)) {
    return {
      displayName: normalizeDisplayNameInput(input.profileDisplayName),
      source: "user_profile",
    };
  }

  if (isUsableDisplayName(input.sessionMemberDisplayName)) {
    return {
      displayName: normalizeDisplayNameInput(input.sessionMemberDisplayName),
      source: "session_member",
    };
  }

  if (isUsableDisplayName(input.presenceDisplayName)) {
    return {
      displayName: normalizeDisplayNameInput(input.presenceDisplayName),
      source: "class_presence",
    };
  }

  return {
    displayName: DISPLAY_NAME_FALLBACK,
    source: "fallback",
  };
}

export type SessionMemberLike = {
  device_id?: unknown;
  joined_at?: unknown;
  display_name?: unknown;
};

export function pickLatestSessionMemberByDevice<T extends SessionMemberLike>(
  rows: T[]
): Map<string, T> {
  const byDevice = new Map<string, T>();

  for (const row of rows) {
    const deviceId = normalizeDisplayNameInput(row.device_id);
    if (!deviceId) continue;

    const joinedAt =
      normalizeDisplayNameInput(row.joined_at) ||
      new Date(0).toISOString();

    const prev = byDevice.get(deviceId);
    if (!prev) {
      byDevice.set(deviceId, row);
      continue;
    }

    const prevJoinedAt =
      normalizeDisplayNameInput(prev.joined_at) ||
      new Date(0).toISOString();

    if (prevJoinedAt <= joinedAt) {
      byDevice.set(deviceId, row);
    }
  }

  return byDevice;
}

export function logDisplayNameResolution(
  context: string,
  deviceId: string,
  resolved: ResolvedDisplayName,
  extra?: Record<string, unknown>
) {
  debugConsoleLog(`[display_name:${context}]`, {
    deviceId,
    displayName: resolved.displayName,
    source: resolved.source,
    ...extra,
  });
}

export function logMemberDisplayNamesFromApi(
  context: string,
  members: Array<{
    device_id?: unknown;
    display_name?: unknown;
    display_name_source?: DisplayNameSource | string | null;
  }>
) {
  for (const member of members) {
    const deviceId = normalizeDisplayNameInput(member.device_id);
    if (!deviceId) continue;

    const sourceRaw = String(member.display_name_source ?? "").trim();
    const source: DisplayNameSource =
      sourceRaw === "user_profile" ||
      sourceRaw === "session_member" ||
      sourceRaw === "class_presence" ||
      sourceRaw === "fallback"
        ? sourceRaw
        : "fallback";

    logDisplayNameResolution(context, deviceId, {
      displayName:
        normalizeDisplayNameInput(member.display_name) || DISPLAY_NAME_FALLBACK,
      source,
    });
  }
}

export function formatMemberDisplayName(member: {
  display_name?: unknown;
}): string {
  return (
    normalizeDisplayNameInput(member.display_name) || DISPLAY_NAME_FALLBACK
  );
}

export function formatDisplayNameWithAge(
  name: string,
  age?: number | null
): string {
  const trimmed = normalizeDisplayNameInput(name) || DISPLAY_NAME_FALLBACK;
  if (age == null || !Number.isFinite(age) || age < 0) {
    return trimmed;
  }

  return `${trimmed}（${Math.floor(age)}歳）`;
}

export function formatMemberDisplayNameWithAge(member: {
  display_name?: unknown;
  age?: number | null;
}): string {
  return formatDisplayNameWithAge(
    formatMemberDisplayName(member),
    member.age
  );
}
