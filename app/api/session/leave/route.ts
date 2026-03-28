import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionId = String(body?.sessionId ?? "").trim();
    const deviceId = String(body?.deviceId ?? "").trim();

    console.log("[session/leave] body =", body);
    console.log("[session/leave] sessionId =", sessionId);
    console.log("[session/leave] deviceId =", deviceId);

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

    console.log("[session/leave] deleteErr =", deleteErr);

    if (deleteErr) {
      return NextResponse.json(
        { ok: false, error: deleteErr.message },
        { status: 500 }
      );
    }

    const { error: ghostDeleteErr } = await supabaseAdmin
      .from("session_members")
      .delete()
      .eq("session_id", sessionId)
      .or("device_id.is.null,device_id.eq.");

    console.log("[session/leave] ghostDeleteErr =", ghostDeleteErr);

    if (ghostDeleteErr) {
      return NextResponse.json(
        { ok: false, error: ghostDeleteErr.message },
        { status: 500 }
      );
    }

    const { data: remainingRows, error: countErr } = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionId)
      .not("device_id", "is", null)
      .neq("device_id", "");

    console.log("[session/leave] remainingRows =", remainingRows);
    console.log("[session/leave] countErr =", countErr);

    if (countErr) {
      return NextResponse.json(
        { ok: false, error: countErr.message },
        { status: 500 }
      );
    }

    const uniqueIds = new Set(
      (remainingRows ?? [])
        .map((r: any) => String(r.device_id ?? "").trim())
        .filter(Boolean)
    );

    const remaining = uniqueIds.size;

    console.log("[session/leave] remaining =", remaining);

    if (remaining <= 0) {
      const { error: closeErr } = await supabaseAdmin
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", sessionId);

      console.log("[session/leave] closeErr =", closeErr);

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
    console.error("[session/leave] internal error =", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}