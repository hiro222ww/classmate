import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body?.deviceId ?? "").trim();
    const classId = String(body?.classId ?? "").trim();

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "class_id_missing" },
        { status: 400 }
      );
    }

    const { data: membership, error: findErr } = await supabaseAdmin
      .from("class_memberships")
      .select("class_id")
      .eq("device_id", deviceId)
      .eq("class_id", classId)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "membership_lookup_failed",
          detail: findErr.message,
        },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { ok: false, error: "not_member" },
        { status: 400 }
      );
    }

    const { data: sessions, error: sessionsErr } = await supabaseAdmin
      .from("sessions")
      .select("id")
      .eq("class_id", classId);

    if (sessionsErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "sessions_lookup_failed",
          detail: sessionsErr.message,
        },
        { status: 500 }
      );
    }

    const sessionIds = (sessions ?? [])
      .map((s) => String(s.id ?? "").trim())
      .filter(Boolean);

    if (sessionIds.length > 0) {
      const { error: sessionMembersErr } = await supabaseAdmin
        .from("session_members")
        .delete()
        .eq("device_id", deviceId)
        .in("session_id", sessionIds);

      if (sessionMembersErr) {
        return NextResponse.json(
          {
            ok: false,
            error: "session_members_delete_failed",
            detail: sessionMembersErr.message,
          },
          { status: 500 }
        );
      }
    }

    const { error: presenceErr } = await supabaseAdmin
      .from("class_presence")
      .delete()
      .eq("device_id", deviceId)
      .eq("class_id", classId);

    if (presenceErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "presence_delete_failed",
          detail: presenceErr.message,
        },
        { status: 500 }
      );
    }

    const { error: delErr } = await supabaseAdmin
      .from("class_memberships")
      .delete()
      .eq("device_id", deviceId)
      .eq("class_id", classId);

    if (delErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "leave_failed",
          detail: delErr.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      classId,
      removedSessionIds: sessionIds,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        detail: e?.message ?? "unknown_error",
      },
      { status: 500 }
    );
  }
}