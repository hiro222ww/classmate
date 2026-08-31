import { describe, expect, it } from "vitest";
import {
  appendJoinModeToPath,
  buildPostJoinPath,
  buildThemeSelectPath,
  joinModeCopy,
  parseJoinMode,
} from "@/lib/joinMode";

describe("parseJoinMode", () => {
  it("defaults to call", () => {
    expect(parseJoinMode(null)).toBe("call");
    expect(parseJoinMode("")).toBe("call");
    expect(parseJoinMode("invalid")).toBe("call");
  });

  it("accepts call and chat", () => {
    expect(parseJoinMode("call")).toBe("call");
    expect(parseJoinMode("chat")).toBe("chat");
  });
});

describe("buildThemeSelectPath", () => {
  it("includes mode query", () => {
    expect(buildThemeSelectPath("chat")).toBe("/class/select?mode=chat");
    expect(buildThemeSelectPath("call", { dev: "1" })).toBe(
      "/class/select?mode=call&dev=1"
    );
  });
});

describe("appendJoinModeToPath", () => {
  it("preserves existing query params", () => {
    expect(appendJoinModeToPath("/class/select?dev=1", "chat")).toBe(
      "/class/select?dev=1&mode=chat"
    );
  });
});

describe("buildPostJoinPath", () => {
  it("routes call mode to /call", () => {
    expect(
      buildPostJoinPath({
        mode: "call",
        classId: "c1",
        sessionId: "s1",
      })
    ).toBe("/call?sessionId=s1&classId=c1");
  });

  it("routes chat mode to /room with autojoin", () => {
    expect(
      buildPostJoinPath({
        mode: "chat",
        classId: "c1",
        sessionId: "s1",
        devQuery: "dev=2",
      })
    ).toBe("/room?autojoin=1&classId=c1&sessionId=s1&dev=2");
  });
});

describe("joinModeCopy", () => {
  it("returns mode-specific select titles", () => {
    expect(joinModeCopy("call").selectTitle).toContain("通話");
    expect(joinModeCopy("chat").selectTitle).toContain("チャット");
  });
});
