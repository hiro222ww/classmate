import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearAutoCallOnce,
  hasAutoCallOnce,
  markAutoCallOnce,
} from "./autoCallOnce";

describe("call exit destination (class room vs random home)", () => {
  it("wires red 退出 teardown and hard navigate helpers", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/CallClient.tsx"),
      "utf8"
    );
    expect(source).toContain("clearAutoCallOnce");
    expect(source).toContain('releaseSessionMic("call_exit"');
    expect(source).toContain("HOME_MY_CLASS_SECTION_ID");
    expect(source).toContain("navigateCallExit");
    expect(source).toContain("buildCallExitHomeHref");
    expect(source).toContain("buildCallExitWaitingRoomHref");
    expect(source).toContain("shouldExitCallToWaitingRoom");
    expect(source).toContain("left_call_return_home");
    expect(source).toContain("left_call_return_room");
    // Soft Next push is unreliable in iOS Safari / Cap WebView shells.
    expect(source).not.toMatch(
      /onExit=\{\(\) => \{[\s\S]*?router\.push\(homeHref\)/
    );
    expect(source).not.toMatch(
      /onExit=\{\(\) => \{[\s\S]*?router\.push\(exitHref\)/
    );
    // Exit must stay enabled during reconnect / fetch failures.
    expect(source).toContain("exitDisabled={false}");
    // Waiting-room return must use autojoin=0 via helper (not autojoin=1 rematch).
    expect(source).toContain("buildCallExitWaitingRoomHref");
    expect(source).toContain("handleVoiceCleanup");
  });

  it("keeps class leave as a separate membership-removing path", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/CallClient.tsx"),
      "utf8"
    );
    expect(source).toContain("/api/class/leave");
    expect(source).toContain("leaveClassAndGoHome");
  });

  it("propagates openJoinedClass from room into /call for My Class exits", () => {
    const source = readFileSync(
      join(process.cwd(), "app/room/RoomClient.tsx"),
      "utf8"
    );
    expect(source).toContain(
      'callJoinedClass ? "&openJoinedClass=1" : ""'
    );
    expect(source).toContain("openJoinedClass || classVisibleInMine");
  });
});

describe("clearAutoCallOnce", () => {
  const sid = "session-exit-test";
  const did = "device-exit-test";

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    markAutoCallOnce(sid, did);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes the one-shot rematch flag", () => {
    expect(hasAutoCallOnce(sid, did)).toBe(true);
    clearAutoCallOnce(sid, did);
    expect(hasAutoCallOnce(sid, did)).toBe(false);
  });
});
