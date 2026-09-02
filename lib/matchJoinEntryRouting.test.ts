import { describe, expect, it } from "vitest";
import { buildMatchedRoomPath } from "@/lib/enterMatchedCallClient";
import { prepareMatchedCallEntry } from "@/lib/enterMatchedCallClient";

describe("match-join entry routing (client)", () => {
  it("routes voice entry to /call after join", () => {
    const entry = prepareMatchedCallEntry({
      classId: "class-a",
      sessionId: "session-a",
      deviceId: "11111111-1111-4111-8111-111111111111",
    });
    expect(entry.ok).toBe(true);
    if (entry.ok) {
      expect(entry.callPath).toContain("/call?");
      expect(entry.callPath).toContain("classId=class-a");
      expect(entry.callPath).toContain("sessionId=session-a");
    }
  });

  it("routes chat entry to /room after join", () => {
    const roomPath = buildMatchedRoomPath("class-b", "session-b");
    expect(roomPath).toContain("/room?");
    expect(roomPath).toContain("autojoin=1");
    expect(roomPath).toContain("classId=class-b");
    expect(roomPath).toContain("sessionId=session-b");
  });
});
