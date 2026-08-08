import crypto from "crypto";
import type { NextResponse } from "next/server";
import {
  ADMIN_MAX_AGE_SECONDS,
  isAdminRequest,
  signAdminToken,
} from "@/lib/adminAuth";
import {
  DEFAULT_OPS_TEST_FLAGS,
  OPS_TEST_COOKIE_NAME,
  type OpsTestFlags,
  anyOpsTestFlagEnabled,
  normalizeOpsTestFlags,
} from "@/lib/opsTestModeShared";

export {
  DEFAULT_OPS_TEST_FLAGS,
  OPS_TEST_COOKIE_NAME,
  type OpsTestFlags,
  anyOpsTestFlagEnabled,
  normalizeOpsTestFlags,
} from "@/lib/opsTestModeShared";

/** Bits: admission | age | allowMinorProfile | recruitment */
function encodeFlagBits(flags: OpsTestFlags): string {
  return [
    flags.ignoreAdmission ? "1" : "0",
    flags.ignoreAge ? "1" : "0",
    flags.allowMinorProfile ? "1" : "0",
    flags.ignoreRecruitment ? "1" : "0",
  ].join("");
}

function decodeFlagBits(bits: string): OpsTestFlags | null {
  // Legacy 3-bit tokens: admission | age | recruitment
  if (/^[01]{3}$/.test(bits)) {
    return {
      ignoreAdmission: bits[0] === "1",
      ignoreAge: bits[1] === "1",
      allowMinorProfile: false,
      ignoreRecruitment: bits[2] === "1",
    };
  }
  if (!/^[01]{4}$/.test(bits)) return null;
  return {
    ignoreAdmission: bits[0] === "1",
    ignoreAge: bits[1] === "1",
    allowMinorProfile: bits[2] === "1",
    ignoreRecruitment: bits[3] === "1",
  };
}

export function createOpsTestToken(flags: OpsTestFlags): string {
  const normalized = normalizeOpsTestFlags(flags);
  const issuedAt = String(Date.now());
  const bits = encodeFlagBits(normalized);
  const sig = signAdminToken(`${issuedAt}.${bits}`);
  return `${issuedAt}.${bits}.${sig}`;
}

export function verifyOpsTestToken(
  token: string | undefined | null
): OpsTestFlags | null {
  if (!token) return null;

  const [issuedAt, bits, sig] = token.split(".");
  if (!issuedAt || !bits || !sig) return null;

  const issuedMs = Number(issuedAt);
  if (!Number.isFinite(issuedMs)) return null;

  const ageMs = Date.now() - issuedMs;
  if (ageMs < 0) return null;
  if (ageMs > ADMIN_MAX_AGE_SECONDS * 1000) return null;

  const flags = decodeFlagBits(bits);
  if (!flags) return null;

  const expected = signAdminToken(`${issuedAt}.${bits}`);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  return flags;
}

export function getOpsTestTokenFromRequest(req: Request): string | undefined {
  const cookieHeader = req.headers.get("cookie") || "";
  return cookieHeader
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${OPS_TEST_COOKIE_NAME}=`))
    ?.split("=")[1];
}

/**
 * Effective per-request overrides.
 * Requires a valid admin session; forged ops cookies alone never apply.
 */
export function resolveOpsTestFlags(req: Request): OpsTestFlags {
  if (!isAdminRequest(req)) {
    return { ...DEFAULT_OPS_TEST_FLAGS };
  }

  try {
    const flags = verifyOpsTestToken(getOpsTestTokenFromRequest(req));
    return flags ? normalizeOpsTestFlags(flags) : { ...DEFAULT_OPS_TEST_FLAGS };
  } catch {
    return { ...DEFAULT_OPS_TEST_FLAGS };
  }
}

export function applyOpsTestCookie(
  res: NextResponse,
  flags: OpsTestFlags
): void {
  const normalized = normalizeOpsTestFlags(flags);
  if (!anyOpsTestFlagEnabled(normalized)) {
    clearOpsTestCookie(res);
    return;
  }

  res.cookies.set(OPS_TEST_COOKIE_NAME, createOpsTestToken(normalized), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE_SECONDS,
  });
}

export function clearOpsTestCookie(res: NextResponse): void {
  res.cookies.set(OPS_TEST_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
