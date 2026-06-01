const KEY_PREFIX = "classmate_left_call";

function storageKey(sessionId: string, deviceId: string) {
  return `${KEY_PREFIX}:${sessionId}:${deviceId}`;
}

export function markLocalLeftCall(sessionId: string, deviceId: string) {
  if (typeof window === "undefined") return;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return;
  try {
    sessionStorage.setItem(storageKey(sid, did), String(Date.now()));
  } catch {
    // ignore quota / private mode
  }
}

export function hasLocalLeftCall(
  sessionId: string | null | undefined,
  deviceId: string | null | undefined
): boolean {
  if (typeof window === "undefined") return false;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return false;
  try {
    return !!sessionStorage.getItem(storageKey(sid, did));
  } catch {
    return false;
  }
}

export function clearLocalLeftCall(sessionId: string, deviceId: string) {
  if (typeof window === "undefined") return;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return;
  try {
    sessionStorage.removeItem(storageKey(sid, did));
  } catch {
    // ignore
  }
}
