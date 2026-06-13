const STORAGE_PREFIX = "voice-call-entry:";

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${String(sessionId ?? "").trim()}`;
}

export function bumpLocalCallEntryGeneration(sessionId: string): number {
  const key = storageKey(sessionId);
  if (typeof sessionStorage === "undefined") return 1;
  const prev = Number(sessionStorage.getItem(key) ?? "0");
  const next = prev + 1;
  sessionStorage.setItem(key, String(next));
  return next;
}

export function peekLocalCallEntryGeneration(sessionId: string): number {
  if (typeof sessionStorage === "undefined") return 0;
  return Number(sessionStorage.getItem(storageKey(sessionId)) ?? "0");
}

export function isLocalCallReentry(sessionId: string): boolean {
  return peekLocalCallEntryGeneration(sessionId) > 1;
}
