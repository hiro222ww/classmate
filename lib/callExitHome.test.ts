import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearAutoCallOnce,
  hasAutoCallOnce,
  markAutoCallOnce,
} from "./autoCallOnce";

describe("call exit → home (not room remount)", () => {
  it("wires red 退出 to home and clears auto-call once", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/CallClient.tsx"),
      "utf8"
    );
    expect(source).toContain("left_call_return_home");
    expect(source).toContain("clearAutoCallOnce");
    expect(source).toContain('releaseSessionMic("call_exit"');
    expect(source).toContain("HOME_MY_CLASS_SECTION_ID");
    expect(source).toContain("navigateCallExitHome");
    expect(source).toContain("buildCallExitHomeHref");
    // Soft Next push is unreliable in iOS Safari / Cap WebView shells.
    expect(source).not.toMatch(
      /onExit=\{\(\) => \{[\s\S]*?router\.push\(homeHref\)/
    );
    // Exit must stay enabled during reconnect / fetch failures.
    expect(source).toContain("exitDisabled={false}");
    // Must not navigate exit back into /room (looks like a no-op + rematch risk).
    expect(source).not.toMatch(
      /onExit=\{\(\) => \{[\s\S]*?\/room\?autojoin=0/
    );
  });

  it("keeps class leave as a separate membership-removing path", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/CallClient.tsx"),
      "utf8"
    );
    expect(source).toContain("/api/class/leave");
    expect(source).toContain("leaveClassAndGoHome");
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
