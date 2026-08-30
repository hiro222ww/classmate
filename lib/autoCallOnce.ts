const KEY_PREFIX = "classmate_auto_call_once";

export function autoCallOnceStorageKey(sessionId: string, deviceId: string) {
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  return `${KEY_PREFIX}:${sid}:${did}`;
}

/** Set one-time auto-call permission for initial match / first invite join. */
export function markAutoCallOnce(sessionId: string, deviceId: string) {
  if (typeof window === "undefined") return;
  const key = autoCallOnceStorageKey(sessionId, deviceId);
  if (!key || key === `${KEY_PREFIX}:`) return;
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

/** Consume the one-time flag; returns true only on first consumption. */
export function consumeAutoCallOnce(sessionId: string, deviceId: string): boolean {
  if (typeof window === "undefined") return false;
  const key = autoCallOnceStorageKey(sessionId, deviceId);
  if (!key || key === `${KEY_PREFIX}:`) return false;
  try {
    if (sessionStorage.getItem(key) !== "1") return false;
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Minimum members required before auto-starting a call from Room.
 * Random-call: enter the call screen immediately even with 1 person
 * (no separate wait-for-3 lobby).
 */
export const AUTO_CALL_MIN_MEMBERS = 1;

/** Alias used by match-join entry paths (same threshold as AUTO_CALL_MIN_MEMBERS). */
export const MATCH_CALL_ENTRY_MIN_MEMBERS = AUTO_CALL_MIN_MEMBERS;

/** Soft-close threshold: after this many members, join_open_until starts (~30s). */
export const RECRUIT_SOFT_CLOSE_AT_MEMBERS = 3;

/** First alone-wait window before extend/quit choice (under soft-close count). */
export const LOBBY_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

/** Extra wait granted once via POST /api/session/lobby-extend. */
export const LOBBY_EXTEND_MS = 5 * 60 * 1000;

/** Delay after readiness before navigating to Call (initial match only). */
export const AUTO_CALL_STABLE_DELAY_MS = 400;

/** Minimum time member count must hold before arming auto-call timer. */
export const AUTO_CALL_MEMBERS_STABLE_MS = 1500;

/** Block manual/auto Call briefly after session resolve redirect. */
export const RECENT_REMATCH_CALL_BLOCK_MS = 2000;

export function hasAutoCallOnce(sessionId: string, deviceId: string): boolean {
  if (typeof window === "undefined") return false;
  const key = autoCallOnceStorageKey(sessionId, deviceId);
  if (!key || key === `${KEY_PREFIX}:`) return false;
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** Move one-time auto-call permission to a resolved session id. */
export function transferAutoCallOnce(
  fromSessionId: string,
  toSessionId: string,
  deviceId: string
) {
  if (!hasAutoCallOnce(fromSessionId, deviceId)) return;
  markAutoCallOnce(toSessionId, deviceId);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(autoCallOnceStorageKey(fromSessionId, deviceId));
  } catch {
    // ignore
  }
}
