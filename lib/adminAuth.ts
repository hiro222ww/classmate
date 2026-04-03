// lib/adminAuth.ts
import { NextResponse } from "next/server";

export function getAdminPasswordFromRequest(req: Request) {
  return (
    req.headers.get("x-admin-password") ||
    req.headers.get("x-admin-passcode") ||
    ""
  ).trim();
}

export function isAdminRequest(req: Request) {
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  if (!expected) return false;

  const actual = getAdminPasswordFromRequest(req);
  return actual === expected;
}

export function requireAdmin(req: Request) {
  const expected = (process.env.ADMIN_PASSWORD || "").trim();

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_PASSWORD is not set" },
      { status: 500 }
    );
  }

  if (!isAdminRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}