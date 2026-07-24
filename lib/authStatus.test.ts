import { describe, expect, it } from "vitest";
import {
  authAccountLabel,
  isAuthLoggedIn,
  isAuthReady,
  resolveAuthStatusFromAccount,
  type AuthAccountSnapshot,
} from "./authStatus";

const anon: AuthAccountSnapshot = {
  userId: "u1",
  deviceId: "d1",
  email: null,
  isAnonymous: true,
  hasLinkedEmail: false,
  entitlements: null,
};

const linked: AuthAccountSnapshot = {
  userId: "u2",
  deviceId: "d1",
  email: "a@example.com",
  isAnonymous: false,
  hasLinkedEmail: true,
  entitlements: null,
};

describe("authStatus", () => {
  it("keeps loading separate from unauthenticated", () => {
    expect(isAuthReady("loading")).toBe(false);
    expect(isAuthLoggedIn("loading")).toBe(false);
    expect(authAccountLabel("loading", null)).toBe("確認中…");
  });

  it("resolves anonymous as unauthenticated only after check", () => {
    expect(resolveAuthStatusFromAccount(anon)).toBe("unauthenticated");
    expect(resolveAuthStatusFromAccount(null)).toBe("unauthenticated");
    expect(authAccountLabel("unauthenticated", anon)).toBe("Google でログイン");
  });

  it("resolves linked account as authenticated", () => {
    expect(resolveAuthStatusFromAccount(linked)).toBe("authenticated");
    expect(isAuthLoggedIn("authenticated")).toBe(true);
    expect(authAccountLabel("authenticated", linked)).toContain("a@example.com");
  });
});
