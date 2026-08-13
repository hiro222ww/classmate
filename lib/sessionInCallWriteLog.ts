/**
 * Attribution for session_members.is_in_call=false writes.
 * Production logs use [session-in-call] so writers are identifiable.
 */

import {
  currentPathname,
  currentVisibilityState,
} from "@/lib/presenceScreenWriteLog";

export type SessionInCallFalseWriteParams = {
  source: string;
  reason: string;
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

/** Stable one-line format for prod log grep. */
export function formatSessionInCallFalseWriteLog(
  params: SessionInCallFalseWriteParams
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
    `[session-in-call] write is_in_call=false ` +
    `source=${String(params.source ?? "").trim() || "-"} ` +
    `reason=${String(params.reason ?? "").trim() || "-"} ` +
    `sessionId=${compactId(params.sessionId)} ` +
    `deviceId=${compactId(params.deviceId, 6)} ` +
    `pathname=${pathname} ` +
    `visibilityState=${visibility} ` +
    `explicitLeave=${explicit}`
  );
}

export function logSessionInCallFalseWrite(
  params: SessionInCallFalseWriteParams
): string {
  const line = formatSessionInCallFalseWriteLog(params);
  console.log(line);
  return line;
}

/** Known DB writers that set session_members.is_in_call=false. */
export const SESSION_IN_CALL_FALSE_WRITE_SOURCES = [
  "CallClient.markSelfLeftCall",
  // Insert-only default (existing rows omit is_in_call and preserve call state).
  "ensureClassSessionMembership.upsert",
  // RPC INSERT defaults false; ON CONFLICT must preserve (no demotion log).
  "rpc.match_join_atomic_v3.upsert",
] as const;
