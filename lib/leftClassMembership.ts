import { clearLocallyHiddenClass, markLocallyHiddenClass } from "@/lib/localHiddenClasses";
import { isDebugLogEnabled, logDebug } from "@/lib/debugLog";

const KEY_PREFIX = "classmate_left_class";

const memoryLeft = new Set<string>();

function storageKey(classId: string) {
  return `${KEY_PREFIX}:${classId}`;
}

export function tailLeftClassId(classId: string) {
  const value = String(classId ?? "").trim();
  if (!value) return "-";
  return value.length <= 6 ? value : value.slice(-6);
}

export function logRoomAsyncIgnored(
  classId: string,
  reason: string,
  context?: string
) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "room",
    `[room-async] ignored reason=${reason} class=${tailLeftClassId(classId)}` +
      (context ? ` context=${context}` : "")
  );
}

export function logRoomRematchBlocked(classId: string, reason = "class_left") {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "room",
    `[room-rematch] blocked reason=${reason} class=${tailLeftClassId(classId)}`
  );
}

export function logHomeOpenClassBlocked(classId: string) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "room",
    `[home-openClass] blocked reason=class_left class=${tailLeftClassId(classId)}`
  );
}

export function isClassLeftBlocked(classId: string): boolean {
  return isClassLeftLocally(classId);
}

/** Mark class as left after confirmed leave API success (or already-left). */
export function markClassLeftLocally(classId: string) {
  const id = String(classId ?? "").trim();
  if (!id) return;

  memoryLeft.add(id);
  markLocallyHiddenClass(id);

  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(id), String(Date.now()));
  } catch {
    // ignore
  }
}

export function isClassLeftLocally(classId: string): boolean {
  const id = String(classId ?? "").trim();
  if (!id) return false;

  if (memoryLeft.has(id)) return true;

  if (typeof window === "undefined") return false;
  try {
    return Boolean(sessionStorage.getItem(storageKey(id)));
  } catch {
    return false;
  }
}

export function clearClassLeftLocally(classId: string) {
  const id = String(classId ?? "").trim();
  if (!id) return;

  memoryLeft.delete(id);
  clearLocallyHiddenClass(id);

  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(id));
  } catch {
    // ignore
  }
}
