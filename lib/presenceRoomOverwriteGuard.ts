/**
 * Guard stale RoomClient room heartbeats from overwriting call-active presence.
 */

export const ROOM_PRESENCE_HEARTBEAT_SOURCE = "RoomClient.presenceHeartbeat";

export type RoomPresenceOverwriteDecision = {
  ignore: boolean;
  reason: string | null;
};

/**
 * When a delayed RoomClient heartbeat (explicitLeave=false) arrives after the
 * device is already in-call for the same session, keep screen=call.
 * Explicit leave always allowed.
 */
export function decideRoomPresenceOverwrite(params: {
  screen: string;
  source: string;
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

  const source = String(params.source ?? "").trim();
  if (source !== ROOM_PRESENCE_HEARTBEAT_SOURCE) {
    return { ignore: false, reason: null };
  }

  const sessionId = String(params.sessionId ?? "").trim();
  if (!sessionId) {
    return { ignore: false, reason: null };
  }

  if (params.sessionMemberInCall === true) {
    return { ignore: true, reason: "session_member_in_call" };
  }

  return { ignore: false, reason: null };
}
