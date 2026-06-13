import { isDebugLogEnabled, logDebug } from "@/lib/debugLog";
import { diffMemberDeviceIds } from "@/lib/memberListGuard";

/** Poll session_members while on /call so joins/leaves propagate live. */
export const CALL_MEMBERS_ACTIVE_POLL_MS = 4_000;

/** Shorter grace when a device disappears from session_members (not just is_in_call=false). */
export const CALL_LIVE_MEMBER_ABSENT_GRACE_MS = 12_000;

export function logCallMembersSync(params: {
  reason: string;
  prev: Array<{ device_id?: string | null }>;
  next: Array<{ device_id?: string | null }>;
  context?: "call" | "room";
}) {
  if (!isDebugLogEnabled()) return;

  const { added, removed } = diffMemberDeviceIds(params.prev, params.next);
  const prevIds = new Set(
    params.prev.map((m) => String(m.device_id ?? "").trim()).filter(Boolean)
  );
  const nextIds = new Set(
    params.next.map((m) => String(m.device_id ?? "").trim()).filter(Boolean)
  );
  const stayed = params.next
    .map((m) => String(m.device_id ?? "").trim())
    .filter((id) => id && prevIds.has(id) && nextIds.has(id))
    .map((id) => id.slice(-4));

  logDebug(
    "call",
    `[call-members-sync] context=${params.context ?? "call"} reason=${params.reason} ` +
      `added=${added.join(",") || "-"} removed=${removed.join(",") || "-"} ` +
      `stayed=${stayed.join(",") || "-"}`
  );
}

export function logCallPeerAddRemote(params: {
  remoteId: string;
  reason: string;
  role: "active" | "passive";
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "call",
    `[call-peer] add-remote remote=${params.remoteId.slice(-4)} ` +
      `reason=${params.reason} role=${params.role}`
  );
}

export function logCallPeerRemoveRemote(params: {
  remoteId: string;
  reason: string;
  graceMs?: number;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "call",
    `[call-peer] remove-remote remote=${params.remoteId.slice(-4)} ` +
      `reason=${params.reason}` +
      (params.graceMs != null ? ` graceMs=${params.graceMs}` : "")
  );
}

export function logCallPresenceStaleGrace(params: {
  remoteId: string;
  phase: "start" | "expired";
  graceMs: number;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "presence",
    `[call-presence] stale-grace-${params.phase} remote=${params.remoteId.slice(-4)} ` +
      `graceMs=${params.graceMs}`
  );
}
