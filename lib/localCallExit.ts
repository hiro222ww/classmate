const KEY_PREFIX = "classmate_left_call";

export const LOCAL_LEFT_CALL_EXPLICIT_REASON = "explicit_leave" as const;

export type LocalLeftCallReason =
  | typeof LOCAL_LEFT_CALL_EXPLICIT_REASON
  | "visibility_hidden"
  | "pagehide"
  | "beforeunload"
  | "reload_restore"
  | "legacy_timestamp"
  | string;

type LocalLeftCallRecord = {
  at: number;
  reason: LocalLeftCallReason;
};

function storageKey(sessionId: string, deviceId: string) {
  return `${KEY_PREFIX}:${sessionId}:${deviceId}`;
}

function parseRecord(raw: string | null): LocalLeftCallRecord | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LocalLeftCallRecord;
    if (
      parsed &&
      typeof parsed.at === "number" &&
      typeof parsed.reason === "string"
    ) {
      return parsed;
    }
  } catch {
    // legacy: plain timestamp string
  }

  const legacyAt = Number(raw);
  if (Number.isFinite(legacyAt) && legacyAt > 0) {
    return { at: legacyAt, reason: "legacy_timestamp" };
  }

  return null;
}

export function getLocalLeftCallRecord(
  sessionId: string | null | undefined,
  deviceId: string | null | undefined
): LocalLeftCallRecord | null {
  if (typeof window === "undefined") return null;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return null;
  try {
    return parseRecord(sessionStorage.getItem(storageKey(sid, did)));
  } catch {
    return null;
  }
}

export function markLocalLeftCall(
  sessionId: string,
  deviceId: string,
  reason: LocalLeftCallReason = LOCAL_LEFT_CALL_EXPLICIT_REASON
) {
  if (typeof window === "undefined") return;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return;

  if (reason !== LOCAL_LEFT_CALL_EXPLICIT_REASON) {
    console.warn(
      `[call-lifecycle] local-left-call-rejected remote=- reason=${reason} ` +
        `required=${LOCAL_LEFT_CALL_EXPLICIT_REASON}`
    );
    return;
  }

  const record: LocalLeftCallRecord = {
    at: Date.now(),
    reason,
  };

  try {
    sessionStorage.setItem(storageKey(sid, did), JSON.stringify(record));
    console.log(
      `[call-lifecycle] explicit-leave session=${sid.slice(-8)} device=${did.slice(-3)}`
    );
  } catch {
    // ignore quota / private mode
  }
}

export function hasLocalLeftCall(
  sessionId: string | null | undefined,
  deviceId: string | null | undefined
): boolean {
  const record = getLocalLeftCallRecord(sessionId, deviceId);
  return record?.reason === LOCAL_LEFT_CALL_EXPLICIT_REASON;
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

export function sanitizeLocalLeftCallAfterReload(
  sessionId: string,
  deviceId: string
): { cleared: boolean; previousReason: LocalLeftCallReason | null } {
  const record = getLocalLeftCallRecord(sessionId, deviceId);
  if (!record) {
    return { cleared: false, previousReason: null };
  }

  if (record.reason === LOCAL_LEFT_CALL_EXPLICIT_REASON) {
    return { cleared: false, previousReason: record.reason };
  }

  clearLocalLeftCall(sessionId, deviceId);
  console.log(
    `[call-lifecycle] local-left-call-cleared session=${sidCompact(sessionId)} ` +
      `device=${didCompact(deviceId)} previousReason=${record.reason}`
  );
  return { cleared: true, previousReason: record.reason };
}

function sidCompact(sessionId: string): string {
  const value = String(sessionId ?? "").trim();
  if (value.length <= 8) return value || "-";
  return value.slice(-8);
}

function didCompact(deviceId: string): string {
  const value = String(deviceId ?? "").trim();
  if (value.length <= 4) return value || "-";
  return value.slice(-3);
}
