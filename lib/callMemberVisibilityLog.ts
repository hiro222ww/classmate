/**
 * Call grid visibility diagnostics for sticky leave vs server rejoin.
 * Prod grep: [call-member-visibility]
 */

import { isConfirmedLeftCallScreen } from "@/lib/voiceSessionMembers";
import { isPresenceFresh } from "@/lib/memberPresenceStatus";
import { getPresenceFreshMsForContext } from "@/lib/sessionMemberListMerge";

export type ServerConfirmedRejoinInput = {
  viewerSessionId: string | null | undefined;
  /** class_presence.session_id from status API (presence_session_id). */
  presenceSessionId?: string | null;
  is_in_call?: boolean | null;
  screen?: string | null;
  last_seen_at?: string | null;
  freshMs?: number;
};

/**
 * Authoritative rejoin: raw server member is fresh, on this session, in call.
 * Must be evaluated BEFORE applyLocalLeftCallOverride.
 */
export function shouldClearStickyLeaveOnServerRejoin(
  params: ServerConfirmedRejoinInput
): boolean {
  if (params.is_in_call !== true) return false;
  if (String(params.screen ?? "").trim().toLowerCase() !== "call") {
    return false;
  }

  const viewerSessionId = String(params.viewerSessionId ?? "").trim();
  const presenceSessionId = String(params.presenceSessionId ?? "").trim();
  if (!viewerSessionId || !presenceSessionId) return false;
  if (presenceSessionId !== viewerSessionId) return false;

  const freshMs =
    params.freshMs ?? getPresenceFreshMsForContext("call");
  if (!isPresenceFresh(params.last_seen_at, freshMs)) {
    return false;
  }

  return true;
}

/** Clear CallClient leave sticky for one remote after server-confirmed rejoin. */
export function clearCallLeaveStickyForDevice(
  refs: {
    localExitedPeers: Set<string>;
    explicitRemovedPeers: Set<string>;
  },
  deviceId: string
): void {
  const id = String(deviceId ?? "").trim();
  if (!id) return;
  refs.localExitedPeers.delete(id);
  refs.explicitRemovedPeers.delete(id);
}

export type CallMemberVisibilityLogParams = {
  deviceId: string;
  sessionId?: string | null;
  reason?: string | null;
  rawInCall: boolean;
  rawScreen: string;
  afterOverrideInCall: boolean;
  afterOverrideScreen: string;
  localExitedPeers: boolean;
  explicitRemoved: boolean;
  sessionStorageLeft: boolean;
  confirmedLeftCall: boolean;
  clearEligibleByRaw: boolean;
  stickyCleared: boolean;
  inVisibleMembers: boolean | null;
  excludeReason: string;
};

function compactId(id: string | null | undefined, tail = 6): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= tail) return value;
  return value.slice(-tail);
}

export function formatCallMemberVisibilityLog(
  params: CallMemberVisibilityLogParams
): string {
  return (
    `[call-member-visibility] ` +
    `deviceId=${compactId(params.deviceId, 6)} ` +
    `sessionId=${compactId(params.sessionId, 8)} ` +
    `reason=${String(params.reason ?? "-")} ` +
    `raw_in_call=${params.rawInCall ? 1 : 0} ` +
    `raw_screen=${params.rawScreen || "-"} ` +
    `after_override_in_call=${params.afterOverrideInCall ? 1 : 0} ` +
    `after_override_screen=${params.afterOverrideScreen || "-"} ` +
    `localExitedPeers=${params.localExitedPeers ? 1 : 0} ` +
    `explicitRemoved=${params.explicitRemoved ? 1 : 0} ` +
    `sessionStorageLeft=${params.sessionStorageLeft ? 1 : 0} ` +
    `confirmed_left_call=${params.confirmedLeftCall ? 1 : 0} ` +
    `clearEligibleByRaw=${params.clearEligibleByRaw ? 1 : 0} ` +
    `stickyCleared=${params.stickyCleared ? 1 : 0} ` +
    `inVisibleMembers=${
      params.inVisibleMembers == null ? "-" : params.inVisibleMembers ? 1 : 0
    } ` +
    `excludeReason=${params.excludeReason}`
  );
}

export function logCallMemberVisibility(
  params: CallMemberVisibilityLogParams
): string {
  const line = formatCallMemberVisibilityLog(params);
  console.log(line);
  return line;
}

export function resolveConfirmedLeftCallFlag(member: {
  is_in_call?: boolean | null;
  screen?: string | null;
}): boolean {
  return isConfirmedLeftCallScreen({
    is_in_call: member.is_in_call === true,
    screen: member.screen,
  });
}

/**
 * Explain why a member is hidden from the call grid after sticky/filter.
 * Prefer the earliest sticky/server mismatch that blocks rejoin show.
 */
export function resolveCallMemberUiExcludeReason(params: {
  rawInCall: boolean;
  rawScreen: string;
  localExitedPeers: boolean;
  explicitRemoved: boolean;
  sessionStorageLeft: boolean;
  afterOverrideInCall: boolean;
  afterOverrideScreen: string;
  participationPriority?: string | null;
  includedInGrid: boolean;
  clearEligibleByRaw?: boolean;
}): string {
  if (params.includedInGrid) return "shown";

  const clearEligible =
    params.clearEligibleByRaw === true ||
    (params.clearEligibleByRaw == null &&
      params.rawInCall &&
      String(params.rawScreen ?? "").trim().toLowerCase() === "call");

  if (
    clearEligible &&
    (params.localExitedPeers ||
      params.explicitRemoved ||
      params.sessionStorageLeft)
  ) {
    return "sticky_leave_uncleared_despite_server_rejoin";
  }

  if (params.localExitedPeers) return "localExitedPeers";
  if (params.explicitRemoved) return "explicitRemoved";
  if (params.sessionStorageLeft) return "sessionStorageLeft";
  if (!params.afterOverrideInCall) {
    return `after_override_not_in_call:screen=${params.afterOverrideScreen || "-"}`;
  }
  if (params.participationPriority) {
    return `priority=${params.participationPriority}`;
  }
  return "filtered_other";
}
