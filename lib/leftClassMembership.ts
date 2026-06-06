import { clearLocallyHiddenClass, markLocallyHiddenClass } from "@/lib/localHiddenClasses";

const KEY_PREFIX = "classmate_left_class";

const memoryLeft = new Set<string>();

function storageKey(classId: string) {
  return `${KEY_PREFIX}:${classId}`;
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
