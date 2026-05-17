import crypto from "crypto";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE_NAME = "classmate_admin";
export const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 12;

function getAdminSecret() {
  const secret = (process.env.ADMIN_PASSWORD || "").trim();
  if (!secret) throw new Error("ADMIN_PASSWORD is not set");
  return secret;
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

export function requireAdmin(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split("=")[1];

  if (!verifyAdminToken(token)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}