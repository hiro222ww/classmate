import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const classId = String(searchParams.get("classId") ?? "").trim();

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "class_id_required" },
        { status: 400 }
      );
    }

    const sb = supabaseServer();

    const { data: memberships, error: membershipsError } = await sb
      .from("class_memberships")
      .select("device_id")
      .eq("class_id", classId);

    if (membershipsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_memberships_failed",
          detail: membershipsError.message,
        },
        { status: 500 }
      );
    }

    const memberIds = (memberships ?? [])
      .map((m: any) => String(m.device_id ?? "").trim())
      .filter(Boolean);

    if (memberIds.length === 0) {
      return NextResponse.json({ ok: true, presence: [] });
    }

    const { data: sessions, error: sessionsError } = await sb
      .from("sessions")
      .select("id, status")
      .eq("class_id", classId)
      .in("status", ["forming", "waiting", "active"]);

    if (sessionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "sessions_lookup_failed",
          detail: sessionsError.message,
        },
        { status: 500 }
      );
    }

    const sessionIds = (sessions ?? [])
      .map((s: any) => String(s.id ?? "").trim())
      .filter(Boolean);

    if (sessionIds.length === 0) {
      return NextResponse.json({
        ok: true,
        presence: memberIds.map((device_id) => ({
          device_id,
          status: "offline",
          session_id: null,
          updated_at: null,
        })),
      });
    }

    const sessionStatusMap = new Map<string, string>();
    for (const s of sessions ?? []) {
      sessionStatusMap.set(String(s.id), String(s.status ?? ""));
    }

    const { data: sessionMembers, error: membersError } = await sb
      .from("session_members")
      .select("device_id, session_id, joined_at")
      .in("session_id", sessionIds);

    if (membersError) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_members_lookup_failed",
          detail: membersError.message,
        },
        { status: 500 }
      );
    }

    const activeMap = new Map<string, any>();

    for (const row of sessionMembers ?? []) {
      const deviceId = String(row.device_id ?? "").trim();
      const sessionId = String(row.session_id ?? "").trim();
      if (!deviceId) continue;

      const sessionStatus = sessionStatusMap.get(sessionId);
      const status =
        sessionStatus === "active"
          ? "active"
          : sessionStatus === "waiting" || sessionStatus === "forming"
            ? "waiting"
            : "offline";

      activeMap.set(deviceId, {
        device_id: deviceId,
        status,
        session_id: sessionId || null,
        updated_at: row.joined_at ?? null,
      });
    }

    const presence = memberIds.map((device_id) => {
      return (
        activeMap.get(device_id) ?? {
          device_id,
          status: "offline",
          session_id: null,
          updated_at: null,
        }
      );
    });

    return NextResponse.json({
      ok: true,
      presence,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        detail: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}