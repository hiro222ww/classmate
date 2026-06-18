import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAppUrl,
  buildInviteRoomUrl,
  getAppOrigin,
  resolveAppOrigin,
} from "./appOrigin";

describe("appOrigin", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("resolveAppOrigin prefers NEXT_PUBLIC_APP_ORIGIN", () => {
    process.env.NEXT_PUBLIC_APP_ORIGIN = "https://classmate-room.com";
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    expect(resolveAppOrigin()).toBe("https://classmate-room.com");
  });

  it("resolveAppOrigin falls back to VERCEL_URL only when env unset", () => {
    delete process.env.NEXT_PUBLIC_APP_ORIGIN;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = "preview-abc.vercel.app";
    expect(resolveAppOrigin()).toBe("https://preview-abc.vercel.app");
  });

  it("buildInviteRoomUrl uses canonical origin from env", () => {
    process.env.NEXT_PUBLIC_APP_ORIGIN = "https://classmate-room.com";
    const url = buildInviteRoomUrl({
      classId: "class-1",
      sessionId: "session-1",
      inviter: "太郎",
    });
    expect(url).toMatch(/^https:\/\/classmate-room\.com\/room\?/);
    expect(url).toContain("invite=1");
    expect(url).toContain("classId=class-1");
    expect(url).toContain("sessionId=session-1");
    expect(url).toContain("inviter=");
  });

  it("getAppOrigin uses env on client when set", () => {
    process.env.NEXT_PUBLIC_APP_ORIGIN = "https://classmate-room.com";
    vi.stubGlobal("window", {
      location: { origin: "https://preview.vercel.app" },
    });
    expect(getAppOrigin()).toBe("https://classmate-room.com");
    vi.unstubAllGlobals();
  });

  it("buildAppUrl joins path", () => {
    process.env.NEXT_PUBLIC_APP_ORIGIN = "https://classmate-room.com/";
    expect(buildAppUrl("/call?sessionId=abc")).toBe(
      "https://classmate-room.com/call?sessionId=abc"
    );
  });
});
