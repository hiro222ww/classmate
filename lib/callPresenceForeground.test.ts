import { describe, expect, it } from "vitest";
import {
  buildCallActivePresenceBody,
  isCallForegroundResumeEvent,
  shouldPostRoomPresenceOnCallEffectCleanup,
  shouldPublishCallPresence,
} from "@/lib/callPresenceForeground";

describe("callPresenceForeground", () => {
  it("publishes call presence only when visible and not explicitly left", () => {
    expect(
      shouldPublishCallPresence({
        documentHidden: false,
        selfLeftCall: false,
      })
    ).toBe(true);
    expect(
      shouldPublishCallPresence({
        documentHidden: true,
        selfLeftCall: false,
      })
    ).toBe(false);
    expect(
      shouldPublishCallPresence({
        documentHidden: false,
        selfLeftCall: true,
      })
    ).toBe(false);
  });

  it("never posts room from call presence effect cleanup", () => {
    expect(shouldPostRoomPresenceOnCallEffectCleanup()).toBe(false);
  });

  it("builds screen=call body for the current session only", () => {
    expect(
      buildCallActivePresenceBody({
        classId: "class-1",
        deviceId: "device-1",
        sessionId: "session-1",
      })
    ).toEqual({
      classId: "class-1",
      deviceId: "device-1",
      screen: "call",
      sessionId: "session-1",
    });
  });

  it("treats visibility/pageshow/focus as foreground resume triggers", () => {
    expect(
      isCallForegroundResumeEvent({
        type: "visibilitychange",
        visibilityState: "visible",
      })
    ).toBe(true);
    expect(
      isCallForegroundResumeEvent({
        type: "visibilitychange",
        visibilityState: "hidden",
      })
    ).toBe(false);
    expect(isCallForegroundResumeEvent({ type: "pageshow" })).toBe(true);
    expect(isCallForegroundResumeEvent({ type: "focus" })).toBe(true);
  });
});
