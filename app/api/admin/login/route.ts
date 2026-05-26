import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_MAX_AGE_SECONDS,
  createAdminToken,
} from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const password = String(body?.password ?? "").trim();
    const expected = String(process.env.ADMIN_PASSWORD ?? "").trim();

    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "ADMIN_PASSWORD is not set" },
        { status: 500 }
      );
    }

    if (password !== expected) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = createAdminToken();

    const res = NextResponse.json({ ok: true });

    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_MAX_AGE_SECONDS,
    });

    return res;
  } catch (e: any) {
    console.error("[admin/login] error", e);

    return NextResponse.json(
      { ok: false, error: e?.message ?? "login_failed" },
      { status: 500 }
    );
  }
}