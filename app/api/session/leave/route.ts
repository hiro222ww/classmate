import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { closeEmptySessionIfNeeded } from "@/lib/sessionLifecycle";

/**
 * Explicit session leave only.
 * - Deletes session_members for (sessionId, deviceId).
 * - Does NOT delete class_memberships (class home membership stays).
 * - Does NOT delete class_presence (heartbeat may mark stale separately).
 * - Must be called from intentional exit UI, not pagehide/bfcache/reload.
 */
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

    const closeRes = await closeEmptySessionIfNeeded(supabaseAdmin, sessionId);

    return NextResponse.json({
      ok: true,
      sessionId,
      remaining: closeRes.remaining,
      closed: closeRes.closed,
    });
  } catch (e: any) {
    console.error("[session/leave] internal error =", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}