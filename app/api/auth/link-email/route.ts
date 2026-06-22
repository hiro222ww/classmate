import { NextResponse } from "next/server";
import { resolveRequestIdentity } from "@/lib/requestIdentity";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "invalid_email" },
        { status: 400 }
      );
    }

    const resolved = await resolveRequestIdentity({
      req,
      deviceId: body?.deviceId,
      requireAuth: true,
    });

    if (!resolved.ok) {
      return NextResponse.json(
        { ok: false, error: resolved.error, message: resolved.message },
        { status: resolved.status }
      );
    }

    const { userId, accessToken } = resolved.identity;
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "access_token_required" },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email }
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      userId,
      email: data.user.email ?? email,
      message:
        "確認メールを送信しました。メール内のリンクを開くと、アカウント連携が完了します。",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "link_email_failed" },
      { status: 500 }
    );
  }
}
