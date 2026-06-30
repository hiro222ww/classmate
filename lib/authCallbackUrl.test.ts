import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildAuthCallbackUrl,
  isLocalAuthOrigin,
} from "@/lib/authCallbackUrl";
import {
  isNativeAuthCallbackUrl,
  nativeAuthCallbackToWebUrl,
  NATIVE_AUTH_CALLBACK_BASE,
} from "@/lib/capacitorClient";

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

  it("uses native scheme in Capacitor app", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://classmate-room.com" },
      Capacitor: { isNativePlatform: () => true },
    });

    expect(buildAuthCallbackUrl("/home")).toBe(
      `${NATIVE_AUTH_CALLBACK_BASE}?returnTo=%2Fhome`
    );
  });

  it("detects localhost callback URLs", () => {
    expect(isLocalAuthOrigin("http://localhost:3000/auth/callback")).toBe(true);
    expect(
      isLocalAuthOrigin("https://classmate-room.com/auth/callback")
    ).toBe(false);
  });
});

describe("capacitorClient native auth return", () => {
  it("detects classmate auth callback URLs", () => {
    expect(
      isNativeAuthCallbackUrl(
        "classmate://auth/callback?code=abc&returnTo=%2Fhome"
      )
    ).toBe(true);
    expect(isNativeAuthCallbackUrl("https://classmate-room.com/auth/callback")).toBe(
      false
    );
  });

  it("converts native callback to web URL preserving query", () => {
    expect(
      nativeAuthCallbackToWebUrl(
        "classmate://auth/callback?code=pkce123&returnTo=%2Fhome",
        "https://classmate-room.com"
      )
    ).toBe(
      "https://classmate-room.com/auth/callback?code=pkce123&returnTo=%2Fhome"
    );
  });

  it("preserves hash fragments", () => {
    expect(
      nativeAuthCallbackToWebUrl(
        "classmate://auth/callback#access_token=xyz",
        "https://classmate-room.com"
      )
    ).toBe("https://classmate-room.com/auth/callback#access_token=xyz");
  });
});
