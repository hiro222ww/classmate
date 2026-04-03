import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function requireAdmin(req: Request) {
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  const actual = (
    req.headers.get("x-admin-password") ||
    req.headers.get("x-admin-passcode") ||
    ""
  ).trim();

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_PASSWORD is not set" },
      { status: 500 }
    );
  }

  if (actual !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}

type RoomDto = {
  session_id: string;
  class_id: string | null;
  class_name: string;
  world_key: string | null;
  topic_key: string | null;
  status: string;
  member_count: number;
  started_at: string | null;
  elapsed_minutes: number;
  report_count: number;
  short_leave_count: number;
  join_leave_burst_count: number;
  block_count: number;
  risk_score: number;
  risk_level: "低" | "中" | "高";
};

function diffMinutesFromNow(iso: string | null) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 1000 / 60));
}

function calcRiskLevel(score: number): "低" | "中" | "高" {
  if (score >= 6) return "高";
  if (score >= 3) return "中";
  return "低";
}

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    console.log("[admin/rooms] start");

    const { data: sessions, error: sessionsErr } = await supabaseAdmin
      .from("sessions")
      .select("id, class_id, status, created_at")
      .in("status", ["forming", "active"])
      .order("created_at", { ascending: false })
      .limit(100);

    console.log("[admin/rooms] sessionsErr =", sessionsErr);
    console.log("[admin/rooms] sessions =", sessions);

    if (sessionsErr) {
      return NextResponse.json(
        { ok: false, error: `sessions query failed: ${sessionsErr.message}` },
        { status: 500 }
      );
    }

    const sessionRows = (sessions ?? []) as Array<{
      id: string;
      class_id: string | null;
      status: string | null;
      created_at: string | null;
    }>;

    if (sessionRows.length === 0) {
      return NextResponse.json({
        ok: true,
        rooms: [],
        summary: {
          active_room_count: 0,
          active_user_count: 0,
          dangerous_room_count: 0,
        },
      });
    }

    const sessionIds = sessionRows.map((s) => s.id);
    const classIds = Array.from(
      new Set(
        sessionRows
          .map((s) => s.class_id)
          .filter((v): v is string => typeof v === "string" && !!v.trim())
      )
    );

    const { data: classes, error: classesErr } = await supabaseAdmin
      .from("classes")
      .select("id, name, world_key, topic_key")
      .in("id", classIds);

    console.log("[admin/rooms] classesErr =", classesErr);
    console.log("[admin/rooms] classes =", classes);

    if (classesErr) {
      return NextResponse.json(
        { ok: false, error: `classes query failed: ${classesErr.message}` },
        { status: 500 }
      );
    }

    const classMap = new Map(
      ((classes ?? []) as Array<{
        id: string;
        name: string | null;
        world_key: string | null;
        topic_key: string | null;
      }>).map((c) => [c.id, c])
    );

    const { data: members, error: membersErr } = await supabaseAdmin
      .from("session_members")
      .select("session_id, device_id")
      .in("session_id", sessionIds);

    console.log("[admin/rooms] membersErr =", membersErr);
    console.log("[admin/rooms] members =", members);

    if (membersErr) {
      return NextResponse.json(
        { ok: false, error: `session_members query failed: ${membersErr.message}` },
        { status: 500 }
      );
    }

    const membersBySession = new Map<string, string[]>();

    for (const row of (members ?? []) as Array<{ session_id: string; device_id: string | null }>) {
      const deviceId = (row.device_id ?? "").trim();
      const list = membersBySession.get(row.session_id) ?? [];
      if (deviceId) list.push(deviceId);
      membersBySession.set(row.session_id, list);
    }

    const rooms: RoomDto[] = sessionRows.map((s) => {
      const cls = s.class_id ? classMap.get(s.class_id) : undefined;
      const deviceIds = membersBySession.get(s.id) ?? [];
      const member_count = new Set(deviceIds).size;

      const report_count = 0;
      const short_leave_count = 0;
      const join_leave_burst_count = Math.max(0, deviceIds.length - member_count);
      const block_count = 0;

      const risk_score =
        report_count * 3 +
        short_leave_count * 2 +
        join_leave_burst_count * 1 +
        block_count * 2;

      return {
        session_id: s.id,
        class_id: s.class_id,
        class_name: cls?.name?.trim() || "（名称未設定）",
        world_key: cls?.world_key ?? null,
        topic_key: cls?.topic_key ?? null,
        status: s.status?.trim() || "unknown",
        member_count,
        started_at: s.created_at ?? null,
        elapsed_minutes: diffMinutesFromNow(s.created_at ?? null),
        report_count,
        short_leave_count,
        join_leave_burst_count,
        block_count,
        risk_score,
        risk_level: calcRiskLevel(risk_score),
      };
    });

    return NextResponse.json({
      ok: true,
      rooms,
      summary: {
        active_room_count: rooms.length,
        active_user_count: rooms.reduce((sum, r) => sum + r.member_count, 0),
        dangerous_room_count: rooms.filter((r) => r.risk_level === "高").length,
      },
    });
  } catch (e: any) {
    console.error("[admin/rooms] fatal =", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "admin rooms failed" },
      { status: 500 }
    );
  }
}