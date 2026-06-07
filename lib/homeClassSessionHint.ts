const KEY_PREFIX = "classmate_home_class_session";

const TERMINAL_SESSION_STATUSES = new Set(["closed", "expired", "ended"]);

type StoredClassSessionHint = {
  sessionId: string;
  sessionStatus: string;
  storedAt: number;
};

function storageKey(classId: string) {
  return `${KEY_PREFIX}:${String(classId ?? "").trim()}`;
}

function normalizeSessionStatus(status: string | null | undefined) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

export function isTerminalSessionStatus(status: string | null | undefined) {
  return TERMINAL_SESSION_STATUSES.has(normalizeSessionStatus(status));
}

/** Remember last joinable session opened for a class (Home→Room). */
export function storeHomeClassSessionHint(
  classId: string,
  sessionId: string,
  sessionStatus?: string | null
) {
  const cid = String(classId ?? "").trim();
  const sid = String(sessionId ?? "").trim();
  if (!cid || !sid) return;
  if (isTerminalSessionStatus(sessionStatus)) return;

  if (typeof window === "undefined") return;
  try {
    const payload: StoredClassSessionHint = {
      sessionId: sid,
      sessionStatus: normalizeSessionStatus(sessionStatus) || "forming",
      storedAt: Date.now(),
    };
    sessionStorage.setItem(storageKey(cid), JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** Fallback hint when /api/class/mine omits session_id. */
export function readHomeClassSessionHint(classId: string): string | null {
  const cid = String(classId ?? "").trim();
  if (!cid || typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(storageKey(cid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredClassSessionHint;
    const sid = String(parsed?.sessionId ?? "").trim();
    if (!sid) return null;
    if (isTerminalSessionStatus(parsed?.sessionStatus)) return null;
    return sid;
  } catch {
    return null;
  }
}

export function clearHomeClassSessionHint(classId: string) {
  const cid = String(classId ?? "").trim();
  if (!cid || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(cid));
  } catch {
    // ignore
  }
}
