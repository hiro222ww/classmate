import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildAuthCallbackUrl,
  isLocalAuthOrigin,
} from "@/lib/authCallbackUrl";

describe("authCallbackUrl", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("uses NEXT_PUBLIC_APP_ORIGIN for email callback on client", () => {
    process.env.NEXT_PUBLIC_APP_ORIGIN = "https://classmate-room.com";
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000" },
    });

    expect(buildAuthCallbackUrl("/premium")).toBe(
      "https://classmate-room.com/auth/callback?returnTo=%2Fpremium"
    );
  });

  it("falls back to browser origin when env unset", () => {
    delete process.env.NEXT_PUBLIC_APP_ORIGIN;
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.stubGlobal("window", {
      location: { origin: "https://classmate-room.com" },
    });

    expect(buildAuthCallbackUrl("/home")).toBe(
      "https://classmate-room.com/auth/callback?returnTo=%2Fhome"
    );
  });

  it("detects localhost callback URLs", () => {
    expect(isLocalAuthOrigin("http://localhost:3000/auth/callback")).toBe(true);
    expect(
      isLocalAuthOrigin("https://classmate-room.com/auth/callback")
    ).toBe(false);
  });
});
