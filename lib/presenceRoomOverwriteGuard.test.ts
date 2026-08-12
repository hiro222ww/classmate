import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decideRoomPresenceOverwrite,
  ENSURE_MEMBERSHIP_ROOM_SOURCE,
  formatPresenceScreenIgnoreLog,
  ROOM_PRESENCE_HEARTBEAT_SOURCE,
  SESSION_JOIN_REFRESH_ROOM_SOURCE,
} from "@/lib/presenceRoomOverwriteGuard";

describe("decideRoomPresenceOverwrite (common room downgrade rule)", () => {
  it("allows first room join when not in call", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: SESSION_JOIN_REFRESH_ROOM_SOURCE,
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: false,
      })
    ).toEqual({ ignore: false, reason: null });

    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: ENSURE_MEMBERSHIP_ROOM_SOURCE,
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: null,
      })
    ).toEqual({ ignore: false, reason: null });
  });

  it("allows screen=call regardless of in_call", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "call",
        source: "CallClient.presenceHeartbeat",
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: true,
      })
    ).toEqual({ ignore: false, reason: null });
  });

  it("ignores delayed RoomClient heartbeat while in_call", () => {
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

  it("ignores delayed session.join room upsert while in_call", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: SESSION_JOIN_REFRESH_ROOM_SOURCE,
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: true,
      })
    ).toEqual({ ignore: true, reason: "session_member_in_call" });
  });

  it("ignores delayed ensure room upsert while in_call", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: ENSURE_MEMBERSHIP_ROOM_SOURCE,
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: true,
      })
    ).toEqual({ ignore: true, reason: "session_member_in_call" });
  });

  it("ignores any unknown non-explicit room source while in_call (source is attribution-only)", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: "future.server.path.roomWrite",
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: true,
      })
    ).toEqual({ ignore: true, reason: "session_member_in_call" });
  });

  it("allows explicit leave even when still marked in_call", () => {
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

  it("allows normal room heartbeat after leave (is_in_call=false)", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
        explicitLeave: false,
        sessionId: "session-1",
        sessionMemberInCall: false,
      })
    ).toEqual({ ignore: false, reason: null });
  });

  it("repeated rejoin: in_call room writes stay ignored; leave then room allowed", () => {
    const sessionId = "session-rejoin";

    for (let i = 0; i < 3; i += 1) {
      // During call / after rejoin while is_in_call=true.
      expect(
        decideRoomPresenceOverwrite({
          screen: "room",
          source: SESSION_JOIN_REFRESH_ROOM_SOURCE,
          explicitLeave: false,
          sessionId,
          sessionMemberInCall: true,
        }).ignore
      ).toBe(true);
      expect(
        decideRoomPresenceOverwrite({
          screen: "room",
          source: ENSURE_MEMBERSHIP_ROOM_SOURCE,
          explicitLeave: false,
          sessionId,
          sessionMemberInCall: true,
        }).ignore
      ).toBe(true);
      expect(
        decideRoomPresenceOverwrite({
          screen: "room",
          source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
          explicitLeave: false,
          sessionId,
          sessionMemberInCall: true,
        }).ignore
      ).toBe(true);

      // Explicit leave always allowed.
      expect(
        decideRoomPresenceOverwrite({
          screen: "room",
          source: "CallClient.markSelfLeftCall",
          explicitLeave: true,
          sessionId,
          sessionMemberInCall: true,
        }).ignore
      ).toBe(false);

      // After leave, soft room writers allowed.
      expect(
        decideRoomPresenceOverwrite({
          screen: "room",
          source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
          explicitLeave: false,
          sessionId,
          sessionMemberInCall: false,
        }).ignore
      ).toBe(false);
    }
  });

  it("allows room write when sessionId missing (cannot prove in-call ownership)", () => {
    expect(
      decideRoomPresenceOverwrite({
        screen: "room",
        source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
        explicitLeave: false,
        sessionId: null,
        sessionMemberInCall: true,
      })
    ).toEqual({ ignore: false, reason: null });
  });

  it("formats ignore log for diagnosis", () => {
    const line = formatPresenceScreenIgnoreLog({
      source: SESSION_JOIN_REFRESH_ROOM_SOURCE,
      reason: "session_member_in_call",
      sessionId: "abcdefgh-session",
      deviceId: "device-abcdef",
      visibilityState: "server",
      pathname: "/api/session/join",
    });
    expect(line).toContain("[presence-screen] ignore screen=room");
    expect(line).toContain(`source=${SESSION_JOIN_REFRESH_ROOM_SOURCE}`);
    expect(line).toContain("reason=session_member_in_call");
    expect(line).toContain("explicitLeave=0");
  });
});
