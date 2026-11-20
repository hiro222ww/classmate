import crypto from "crypto";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE_NAME = "classmate_admin";
export const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 12;

/** Login brute-force window (process-local; resets on cold start). */
export const ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 20;

type LoginAttemptBucket = { count: number; resetAt: number };
const loginAttemptsByKey = new Map<string, LoginAttemptBucket>();

function getAdminSecret() {
  const secret = (process.env.ADMIN_PASSWORD || "").trim();
  if (!secret) throw new Error("ADMIN_PASSWORD is not set");
  return secret;
}

/** Constant-time string compare (length mismatch still returns false safely). */
export function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length) {
    // Spend similar work without leaking which side was longer.
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function getLoginRateLimitKey(req: Request): string {
  const forwarded = (req.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    ?.trim();
  const realIp = (req.headers.get("x-real-ip") || "").trim();
  return forwarded || realIp || "unknown";
}

/**
 * Returns true when the key is still under the attempt budget.
 * Failed and successful attempts both count (slow down stuffing).
 */
export function consumeLoginAttempt(
  key: string,
  now = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  const existing = loginAttemptsByKey.get(key);
  if (!existing || now >= existing.resetAt) {
    loginAttemptsByKey.set(key, {
      count: 1,
      resetAt: now + ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      ),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test helper — clears in-memory login buckets. */
export function resetLoginRateLimitForTests() {
  loginAttemptsByKey.clear();
}

export function signAdminToken(issuedAt: string) {
  const secret = getAdminSecret();

  return crypto
    .createHmac("sha256", secret)
    .update(issuedAt)
    .digest("hex");
}

export function createAdminToken() {
  const issuedAt = String(Date.now());
  const sig = signAdminToken(issuedAt);
  return `${issuedAt}.${sig}`;
}

export function verifyAdminToken(token: string | undefined | null) {
  if (!token) return false;

  const [issuedAt, sig] = token.split(".");
  if (!issuedAt || !sig) return false;

  const issuedMs = Number(issuedAt);
  if (!Number.isFinite(issuedMs)) return false;

  const ageMs = Date.now() - issuedMs;
  if (ageMs < 0) return false;
  if (ageMs > ADMIN_MAX_AGE_SECONDS * 1000) return false;

  const expected = signAdminToken(issuedAt);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export function getAdminTokenFromRequest(req: Request): string | undefined {
  const cookieHeader = req.headers.get("cookie") || "";
  return cookieHeader
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split("=")[1];
}

/** Server-side admin session check (HMAC cookie from /admin login). */
export function isAdminRequest(req: Request): boolean {
  try {
    return verifyAdminToken(getAdminTokenFromRequest(req));
  } catch {
    return false;
  }
}

export function requireAdmin(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}