const KEY_PREFIX = "classmate_hidden_class";
/** Optimistic hide after class leave success only; cleared when /api/class/mine returns the class. */
const DEFAULT_TTL_MS = 60 * 1000;

const memoryHiddenUntil = new Map<string, number>();

function storageKey(classId: string) {
  return `${KEY_PREFIX}:${classId}`;
}

export function markLocallyHiddenClass(
  classId: string,
  ttlMs = DEFAULT_TTL_MS
) {
  const id = String(classId ?? "").trim();
  if (!id) return;

  const until = Date.now() + ttlMs;
  memoryHiddenUntil.set(id, until);

  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(id), String(until));
  } catch {
    // ignore
  }
}

export function isLocallyHiddenClass(classId: string): boolean {
  const id = String(classId ?? "").trim();
  if (!id) return false;

  const now = Date.now();
  const memUntil = memoryHiddenUntil.get(id);
  if (memUntil != null) {
    if (memUntil > now) return true;
    memoryHiddenUntil.delete(id);
  }

  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(storageKey(id));
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= now) {
      sessionStorage.removeItem(storageKey(id));
      return false;
    }
    memoryHiddenUntil.set(id, until);
    return true;
  } catch {
    return false;
  }
}

export function clearLocallyHiddenClass(classId: string) {
  const id = String(classId ?? "").trim();
  if (!id) return;

  memoryHiddenUntil.delete(id);

  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(id));
  } catch {
    // ignore
  }
}

/** @deprecated Server membership wins; use clearLocallyHiddenClass on mine success instead. */
export function filterOutLocallyHiddenClasses<T extends { id?: string | null }>(
  rows: T[]
): T[] {
  return rows;
}
