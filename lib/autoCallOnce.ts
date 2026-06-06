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
