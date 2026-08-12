/**
 * Common rule: never demote call-active presence with a non-explicit room write.
 * Explicit leave always allowed. Source is attribution-only.
 */

export const ROOM_PRESENCE_HEARTBEAT_SOURCE = "RoomClient.presenceHeartbeat";
export const SESSION_JOIN_REFRESH_ROOM_SOURCE =
  "api.session.join.refreshRoomPresence";
export const ENSURE_MEMBERSHIP_ROOM_SOURCE =
  "ensureClassSessionMembership.upsert";

export type RoomPresenceOverwriteDecision = {
  ignore: boolean;
  reason: string | null;
};

/**
 * Shared downgrade rule for any non-explicit screen=room write.
 * If the same device+session is already is_in_call=true, keep call presence.
 */
export function decideRoomPresenceOverwrite(params: {
  screen: string;
  /** Attribution only — does not change the rule. */
  source?: string;
  explicitLeave: boolean;
  sessionId: string | null | undefined;
  sessionMemberInCall: boolean | null;
}): RoomPresenceOverwriteDecision {
  const screen = String(params.screen ?? "").trim();
  if (screen !== "room") {
    return { ignore: false, reason: null };
  }

  if (params.explicitLeave === true) {
    return { ignore: false, reason: null };
  }

  const sessionId = String(params.sessionId ?? "").trim();
  if (!sessionId) {
    // Without a session id we cannot prove in-call ownership; allow write.
    return { ignore: false, reason: null };
  }

  if (params.sessionMemberInCall === true) {
    return { ignore: true, reason: "session_member_in_call" };
  }

  return { ignore: false, reason: null };
}

export function formatPresenceScreenIgnoreLog(params: {
  source: string;
  reason: string;
  sessionId?: string | null;
  deviceId?: string | null;
  visibilityState?: string | null;
  pathname?: string | null;
}): string {
  const sessionId = String(params.sessionId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();
  return (
    `[presence-screen] ignore screen=room source=${params.source} ` +
    `reason=${params.reason} ` +
    `sessionId=${sessionId ? sessionId.slice(-8) : "-"} ` +
    `deviceId=${deviceId ? deviceId.slice(-6) : "-"} ` +
    `visibilityState=${String(params.visibilityState ?? "server")} ` +
    `pathname=${String(params.pathname ?? "-")} explicitLeave=0`
  );
}
