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

    const { error: deleteErr } = await supabaseAdmin
      .from("session_members")
      .delete()
      .eq("session_id", sessionId)
      .eq("device_id", deviceId);

    if (deleteErr) {
      return NextResponse.json(
        { ok: false, error: deleteErr.message },
        { status: 500 }
      );
    }

    const { count, error: countErr } = await supabaseAdmin
      .from("session_members")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (countErr) {
      return NextResponse.json(
        { ok: false, error: countErr.message },
        { status: 500 }
      );
    }

    const remaining = Number(count ?? 0);

    if (remaining <= 0) {
      const { error: closeErr } = await supabaseAdmin
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", sessionId);

      if (closeErr) {
        return NextResponse.json(
          { ok: false, error: closeErr.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      remaining,
      closed: remaining <= 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}