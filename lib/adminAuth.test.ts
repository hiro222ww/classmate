import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  consumeLoginAttempt,
  createAdminToken,
  getAdminTokenFromRequest,
  isAdminRequest,
  requireAdmin,
  resetLoginRateLimitForTests,
  safeEqualString,
  verifyAdminToken,
} from "./adminAuth";

const ORIGINAL_PASSWORD = process.env.ADMIN_PASSWORD;

describe("adminAuth request checks", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "test-admin-secret";
    resetLoginRateLimitForTests();
  });

  afterEach(() => {
    if (ORIGINAL_PASSWORD === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = ORIGINAL_PASSWORD;
    }
    resetLoginRateLimitForTests();
  });

  it("compares passwords in constant-time fashion", () => {
    expect(safeEqualString("abc", "abc")).toBe(true);
    expect(safeEqualString("abc", "abd")).toBe(false);
    expect(safeEqualString("abc", "ab")).toBe(false);
  });

  it("rate-limits repeated login attempts per key", () => {
    for (let i = 0; i < ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i += 1) {
      expect(consumeLoginAttempt("10.0.0.1").allowed).toBe(true);
    }
    const blocked = consumeLoginAttempt("10.0.0.1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(consumeLoginAttempt("10.0.0.2").allowed).toBe(true);
  });

  it("verifies tokens created with ADMIN_PASSWORD", () => {
    const token = createAdminToken();
    expect(verifyAdminToken(token)).toBe(true);
    expect(verifyAdminToken("bad.token")).toBe(false);
    expect(verifyAdminToken(null)).toBe(false);
  });

  it("reads admin cookie from request", () => {
    const token = createAdminToken();
    const req = new Request("http://localhost/api/class/match-join-v2", {
      headers: {
        cookie: `other=1; ${ADMIN_COOKIE_NAME}=${token}; x=y`,
      },
    });
    expect(getAdminTokenFromRequest(req)).toBe(token);
    expect(isAdminRequest(req)).toBe(true);
    expect(requireAdmin(req)).toBeNull();
  });

  it("rejects requests without a valid admin cookie", () => {
    const req = new Request("http://localhost/api/class/match-join-v2", {
      headers: { cookie: "foo=bar" },
    });
    expect(isAdminRequest(req)).toBe(false);
    const denied = requireAdmin(req);
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(401);
  });

  it("does not treat forged cookies as admin", () => {
    const req = new Request("http://localhost/api/session/join", {
      headers: {
        cookie: `${ADMIN_COOKIE_NAME}=1234567890.deadbeef`,
      },
    });
    expect(isAdminRequest(req)).toBe(false);
  });
});
