import { describe, expect, it } from "vitest";
import {
  decideRoomPresenceOverwrite,
  ROOM_PRESENCE_HEARTBEAT_SOURCE,
} from "@/lib/presenceRoomOverwriteGuard";

describe("decideRoomPresenceOverwrite", () => {
  it("keeps call when delayed room heartbeat arrives while in_call", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: true,
      })
    ).toEqual({ ignore: true, reason: "session_member_in_call" });
  });

  it("allows room heartbeat when not in call (normal room stay)", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: false,
      })
    ).toEqual({ ignore: false, reason: null });

    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: null,
      })
    ).toEqual({ ignore: false, reason: null });
  });

  it("allows explicit leave to set room even when in_call", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: "CallClient.markSelfLeftCall",
        explicitLeave: true,
        sessionId: "session-1",
        sessionMemberInCall: true,
      })
    ).toEqual({ ignore: false, reason: null });
  });

  it("does not guard non-heartbeat room sources", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: "api.session.join.refreshRoomPresence",
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: true,
      })
    ).toEqual({ ignore: false, reason: null });
  });

  it("does not ignore screen=call updates", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "call",
        source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: true,
      })
    ).toEqual({ ignore: false, reason: null });
  });

  it("call → explicit leave → is_in_call=false → room heartbeat allowed", () => {
    const sessionId = "session-leave-flow";

    // Still on call: delayed room heartbeat must not win.
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
        explicitLeave: false,
        sessionId,
        sessionMemberInCall: true,
      }).ignore
    ).toBe(true);

    // Exit button → markSelfLeftCall posts room with explicitLeave=true
    // (allowed even before session_members.is_in_call flips).
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: "CallClient.markSelfLeftCall",
        explicitLeave: true,
        sessionId,
        sessionMemberInCall: true,
      }).ignore
    ).toBe(false);

    // After markSelfLeftCall's session_members.is_in_call=false lands,
    // normal RoomClient heartbeats must be allowed again.
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
        explicitLeave: false,
        sessionId,
        sessionMemberInCall: false,
      })
    ).toEqual({ ignore: false, reason: null });
  });
});
