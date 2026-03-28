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

    // 自分を削除
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

    // 空 device_id のゴミ行を掃除
    const { error: ghostDeleteErr } = await supabaseAdmin
      .from("session_members")
      .delete()
      .eq("session_id", sessionId)
      .or("device_id.is.null,device_id.eq.");

    if (ghostDeleteErr) {
      return NextResponse.json(
        { ok: false, error: ghostDeleteErr.message },
        { status: 500 }
      );
    }

    // 有効メンバーだけ数える
    const { data: remainingRows, error: countErr } = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionId)
      .not("device_id", "is", null)
      .neq("device_id", "");

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