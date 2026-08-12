/**
 * Attribution for class_presence screen writes (especially screen=room).
 * Production logs use [presence-screen] so writers are identifiable.
 */

export type PresenceScreenWriteParams = {
  source: string;
  reason: string;
  screen: string;
  classId?: string | null;
  sessionId?: string | null;
  deviceId?: string | null;
  visibilityState?: string | null;
  pathname?: string | null;
  explicitLeave?: boolean | null;
};

function compactId(id: string | null | undefined, tail = 8): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= tail) return value;
  return value.slice(-tail);
}

export function currentVisibilityState(): string {
  if (typeof document === "undefined") return "ssr";
  return String(document.visibilityState ?? "unknown");
}

export function currentPathname(): string {
  if (typeof window === "undefined") return "ssr";
  return String(window.location?.pathname ?? "unknown");
}

/** Stable one-line format for prod log grep. */
export function formatPresenceScreenWriteLog(
  params: PresenceScreenWriteParams
): string {
  const visibility =
    params.visibilityState != null && String(params.visibilityState).trim()
      ? String(params.visibilityState).trim()
      : currentVisibilityState();
  const pathname =
    params.pathname != null && String(params.pathname).trim()
      ? String(params.pathname).trim()
      : currentPathname();
  const explicit =
    params.explicitLeave == null ? "-" : params.explicitLeave ? "1" : "0";

  return (
    `[presence-screen] write screen=${String(params.screen ?? "").trim() || "-"} ` +
    `source=${String(params.source ?? "").trim() || "-"} ` +
    `reason=${String(params.reason ?? "").trim() || "-"} ` +
    `sessionId=${compactId(params.sessionId)} ` +
    `deviceId=${compactId(params.deviceId, 6)} ` +
    `classId=${compactId(params.classId, 6)} ` +
    `visibilityState=${visibility} ` +
    `pathname=${pathname} ` +
    `explicitLeave=${explicit}`
  );
}

export function logPresenceScreenWrite(params: PresenceScreenWriteParams): string {
  const line = formatPresenceScreenWriteLog(params);
  // Always emit — PROD_LOG_INCLUDE whitelists [presence-screen] for client filters.
  console.log(line);
  return line;
}

/** Known screen=room write sources (inventory for diagnosis). */
export const PRESENCE_ROOM_WRITE_SOURCES = [
  "CallClient.markSelfLeftCall",
  "CallClient.presenceEffectCleanup",
  "RoomClient.presenceHeartbeat",
  "api.session.join.refreshRoomPresence",
  "ensureClassSessionMembership.upsert",
  "api.class.presence.unattributed",
] as const;
