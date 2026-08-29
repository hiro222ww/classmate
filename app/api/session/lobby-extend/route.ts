import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidDeviceUuid } from "@/lib/deviceIdValidation";
import { LOBBY_EXTEND_MS } from "@/lib/autoCallOnce";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

/**
 * Extend lobby wait once: bump sessions.created_at by 5 minutes and set
 * lobby_extended_once. Used when fewer than 3 members after the first wait window.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.sessionId ?? "").trim();
    const deviceId = String(body?.deviceId ?? "").trim();

    if (!isUuid(sessionId) || !isValidDeviceUuid(deviceId)) {
      return NextResponse.json(
        { ok: false, error: "missing_session_or_device" },
        { status: 400 }
      );
    }

    const { data: member, error: memberErr } = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionId)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (memberErr) {
      return NextResponse.json(
        { ok: false, error: "member_lookup_failed", detail: memberErr.message },
        { status: 500 }
      );
    }

    if (!member) {
      return NextResponse.json(
        { ok: false, error: "not_session_member" },
        { status: 403 }
      );
    }

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("sessions")
      .select("id, created_at, lobby_extended_once")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json(
        { ok: false, error: "session_lookup_failed", detail: sessionErr.message },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "session_not_found" },
        { status: 404 }
      );
    }

    if (session.lobby_extended_once === true) {
      return NextResponse.json(
        { ok: false, error: "already_extended" },
        { status: 400 }
      );
    }

    const createdAtMs = new Date(String(session.created_at ?? "")).getTime();
    const baseMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
    const nextCreatedAt = new Date(baseMs + LOBBY_EXTEND_MS).toISOString();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("sessions")
      .update({
        lobby_extended_once: true,
        created_at: nextCreatedAt,
      })
      .eq("id", sessionId)
      .eq("lobby_extended_once", false)
      .select("id, created_at, lobby_extended_once")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: "lobby_extend_failed", detail: updateErr.message },
        { status: 500 }
      );
    }

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "already_extended" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      created_at: updated.created_at ?? nextCreatedAt,
      lobby_extended_once: true,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    console.error("[session/lobby-extend] internal error =", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
