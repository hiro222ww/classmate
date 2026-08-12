import { describe, expect, it } from "vitest";
import { shouldEmitProductionLogLine } from "@/lib/debugLog";
import {
  formatPresenceScreenWriteLog,
  PRESENCE_ROOM_WRITE_SOURCES,
} from "@/lib/presenceScreenWriteLog";

describe("presenceScreenWriteLog", () => {
  it("formats source/reason/session/device/visibility for room writes", () => {
    const line = formatPresenceScreenWriteLog({
      source: "CallClient.markSelfLeftCall",
      reason: "explicit_leave",
      screen: "room",
      sessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      deviceId: "device-fd3b12",
      classId: "class-abcdef",
      visibilityState: "visible",
      pathname: "/call",
      explicitLeave: true,
    });

    expect(line).toContain("[presence-screen] write screen=room");
    expect(line).toContain("source=CallClient.markSelfLeftCall");
    expect(line).toContain("reason=explicit_leave");
    expect(line).toContain("sessionId=eeeeeeee");
    expect(line).toContain("deviceId=fd3b12");
    expect(line).toContain("visibilityState=visible");
    expect(line).toContain("explicitLeave=1");
  });

  it("is emitted in production log filters", () => {
    const line = formatPresenceScreenWriteLog({
      source: "RoomClient.presenceHeartbeat",
      reason: "room_heartbeat",
      screen: "room",
      sessionId: "sid",
      deviceId: "did",
      visibilityState: "hidden",
      pathname: "/room",
      explicitLeave: false,
    });
    expect(shouldEmitProductionLogLine(line)).toBe(true);
  });

  it("lists known room write sources for diagnosis", () => {
    expect(PRESENCE_ROOM_WRITE_SOURCES).toContain("CallClient.markSelfLeftCall");
    expect(PRESENCE_ROOM_WRITE_SOURCES).toContain(
      "CallClient.presenceEffectCleanup"
    );
    expect(PRESENCE_ROOM_WRITE_SOURCES).toContain("RoomClient.presenceHeartbeat");
    expect(PRESENCE_ROOM_WRITE_SOURCES).toContain(
      "api.session.join.refreshRoomPresence"
    );
    expect(PRESENCE_ROOM_WRITE_SOURCES).toContain(
      "ensureClassSessionMembership.upsert"
    );
  });
});
