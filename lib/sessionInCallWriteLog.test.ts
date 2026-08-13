import { describe, expect, it } from "vitest";
import { shouldEmitProductionLogLine } from "@/lib/debugLog";
import {
  formatSessionInCallFalseWriteLog,
  SESSION_IN_CALL_FALSE_WRITE_SOURCES,
} from "@/lib/sessionInCallWriteLog";

describe("sessionInCallWriteLog", () => {
  it("formats is_in_call=false write attribution", () => {
    const line = formatSessionInCallFalseWriteLog({
      source: "CallClient.markSelfLeftCall",
      reason: "explicit_leave",
      sessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      deviceId: "device-fd3b12",
      visibilityState: "visible",
      pathname: "/call",
      explicitLeave: true,
    });

    expect(line).toContain("[session-in-call] write is_in_call=false");
    expect(line).toContain("source=CallClient.markSelfLeftCall");
    expect(line).toContain("reason=explicit_leave");
    expect(line).toContain("sessionId=eeeeeeee");
    expect(line).toContain("deviceId=fd3b12");
    expect(line).toContain("pathname=/call");
    expect(line).toContain("visibilityState=visible");
    expect(line).toContain("explicitLeave=1");
  });

  it("is emitted in production log filters", () => {
    const line = formatSessionInCallFalseWriteLog({
      source: "ensureClassSessionMembership.upsert",
      reason: "join_source=rejoin",
      sessionId: "sid",
      deviceId: "did",
      visibilityState: "server",
      pathname: "ensureClassSessionMembership",
      explicitLeave: false,
    });
    expect(shouldEmitProductionLogLine(line)).toBe(true);
  });

  it("lists known false-write sources", () => {
    expect(SESSION_IN_CALL_FALSE_WRITE_SOURCES).toContain(
      "CallClient.markSelfLeftCall"
    );
    expect(SESSION_IN_CALL_FALSE_WRITE_SOURCES).toContain(
      "ensureClassSessionMembership.upsert"
    );
    expect(SESSION_IN_CALL_FALSE_WRITE_SOURCES).toContain(
      "rpc.match_join_atomic_v3.upsert"
    );
  });
});
