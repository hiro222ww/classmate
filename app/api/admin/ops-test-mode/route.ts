import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  DEFAULT_OPS_TEST_FLAGS,
  applyOpsTestCookie,
  normalizeOpsTestFlags,
  resolveOpsTestFlags,
} from "@/lib/opsTestMode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  return NextResponse.json({
    ok: true,
    flags: resolveOpsTestFlags(req),
  });
}

export async function PUT(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const flags = normalizeOpsTestFlags(body?.flags ?? body);

  const res = NextResponse.json({
    ok: true,
    flags,
  });
  applyOpsTestCookie(res, flags);
  return res;
}

export async function DELETE(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const res = NextResponse.json({
    ok: true,
    flags: { ...DEFAULT_OPS_TEST_FLAGS },
  });
  applyOpsTestCookie(res, DEFAULT_OPS_TEST_FLAGS);
  return res;
}
