import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionId = String(body?.sessionId ?? "").trim();
    const deviceId = String(body?.deviceId ?? "").trim();

    if (!sessionId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "missing_session_or_device" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("session_members")
      .delete()
      .eq("session_id", sessionId)
      .eq("device_id", deviceId);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}