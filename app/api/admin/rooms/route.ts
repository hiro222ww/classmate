import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLOSED_STATUSES = ["closed", "ended", "expired"];

type RoomMemberDto = {
  device_id: string;
  display_name: string | null;
  joined_at: string | null;
};

type RoomRepairSummary = {
  class_memberships: number;
  session_members: number;
  class_presence: number;
  members_missing_membership: number;
  possible_split_sessions: number;
};

type RoomDto = {
  session_id: string;
  class_id: string | null;
  class_name: string;
  world_key: string | null;
  topic_key: string | null;
  status: string;
  member_count: number;
  members: RoomMemberDto[];
  repair_summary: RoomRepairSummary | null;
  started_at: string | null;
  created_at: string | null;
  updated_at: string | null;
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

function isClosedStatus(status: string | null | undefined) {
  if (!status) return false;
  return CLOSED_STATUSES.includes(String(status).trim().toLowerCase());
}

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    console.log("[admin/rooms] start");

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);

    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from("sessions")
      .select("id, class_id, topic, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (sessionsError) {
      console.error("[admin/rooms] sessions fetch failed", sessionsError);
      return NextResponse.json(
        {
          ok: false,
          error: "sessions_fetch_failed",
          detail: sessionsError.message,
        },
        { status: 500 }
      );
    }

    const activeSessions = (sessions ?? []).filter((s) => {
      return !isClosedStatus(s.status);
    });

    console.log("[admin/rooms] sessions fetched", {
      count: sessions?.length ?? 0,
      activeCount: activeSessions.length,
      sessionIds: activeSessions.map((s) => s.id),
    });

    const sessionIds = activeSessions.map((s) => s.id);

    if (sessionIds.length === 0) {
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

    const { data: members, error: membersError } = await supabaseAdmin
      .from("session_members")
      .select("session_id, device_id, created_at")
      .in("session_id", sessionIds);

    if (membersError) {
      console.error("[admin/rooms] members fetch failed", membersError);
      return NextResponse.json(
        {
          ok: false,
          error: "members_fetch_failed",
          detail: membersError.message,
        },
        { status: 500 }
      );
    }

    const memberCountBySessionId = new Map<string, number>();
    const latestMemberAtBySessionId = new Map<string, string>();

    for (const member of members ?? []) {
      const sid = String(member.session_id ?? "").trim();
      const deviceId = String(member.device_id ?? "").trim();
      if (!sid || !deviceId) continue;

      memberCountBySessionId.set(
        sid,
        (memberCountBySessionId.get(sid) ?? 0) + 1
      );

      const createdAt = member.created_at ?? null;
      if (createdAt) {
        const prev = latestMemberAtBySessionId.get(sid);
        if (!prev || new Date(createdAt).getTime() > new Date(prev).getTime()) {
          latestMemberAtBySessionId.set(sid, createdAt);
        }
      }
    }

    console.log("[admin/rooms] members fetched", {
      count: members?.length ?? 0,
      sessionIdsWithMembers: Array.from(memberCountBySessionId.keys()),
    });

    const sessionsWithMembers = activeSessions.filter((s) => {
      return (memberCountBySessionId.get(String(s.id)) ?? 0) > 0;
    });

    const classIds = Array.from(
      new Set(
        sessionsWithMembers
          .map((s) => String(s.class_id ?? "").trim())
          .filter((id) => Boolean(id))
      )
    );

    let classById = new Map<
      string,
      {
        id: string;
        name: string | null;
        world_key: string | null;
        topic_key: string | null;
      }
    >();

    if (classIds.length > 0) {
      const { data: classes, error: classesError } = await supabaseAdmin
        .from("classes")
        .select("id, name, world_key, topic_key")
        .in("id", classIds);

      if (classesError) {
        console.warn("[admin/rooms] classes fetch failed", classesError);
      } else {
        classById = new Map(
          (classes ?? []).map((c) => [String(c.id), c])
        );
      }
    }

    const memberRows = (members ?? []).filter((row) => {
      const sid = String(row.session_id ?? "").trim();
      return sessionsWithMembers.some((s) => String(s.id) === sid);
    });

    const allDeviceIds = Array.from(
      new Set(
        memberRows
          .map((m) => String(m.device_id ?? "").trim())
          .filter((v) => Boolean(v))
      )
    );

    let profileMap = new Map<string, { display_name: string | null }>();

    if (allDeviceIds.length > 0) {
      const { data: profilesRaw, error: profilesError } = await supabaseAdmin
        .from("user_profiles")
        .select("device_id, display_name")
        .in("device_id", allDeviceIds);

      if (profilesError) {
        console.warn("[admin/rooms] user_profiles fetch failed", profilesError);
      } else {
        profileMap = new Map(
          (profilesRaw ?? [])
            .filter(
              (p) =>
                typeof p.device_id === "string" && Boolean(p.device_id.trim())
            )
            .map((p) => [
              p.device_id!.trim(),
              {
                display_name: p.display_name?.trim() || null,
              },
            ])
        );
      }
    }

    const membersBySession = new Map<string, RoomMemberDto[]>();

    for (const row of memberRows) {
      const sessionId = String(row.session_id ?? "").trim();
      const deviceId = String(row.device_id ?? "").trim();
      if (!sessionId || !deviceId) continue;

      const profile = profileMap.get(deviceId);
      const list = membersBySession.get(sessionId) ?? [];

      list.push({
        device_id: deviceId,
        display_name: profile?.display_name ?? null,
        joined_at: row.created_at ?? null,
      });
      membersBySession.set(sessionId, list);
    }

    const membershipCountByClass = new Map<string, number>();
    const presenceCountByClass = new Map<string, number>();
    const membershipDeviceByClass = new Map<string, Set<string>>();

    if (classIds.length > 0) {
      const { data: membershipRows } = await supabaseAdmin
        .from("class_memberships")
        .select("class_id, device_id")
        .in("class_id", classIds);

      for (const row of membershipRows ?? []) {
        const cid = String(row.class_id ?? "").trim();
        const did = String(row.device_id ?? "").trim();
        if (!cid || !did) continue;

        membershipCountByClass.set(cid, (membershipCountByClass.get(cid) ?? 0) + 1);
        const set = membershipDeviceByClass.get(cid) ?? new Set<string>();
        set.add(did);
        membershipDeviceByClass.set(cid, set);
      }

      const { data: presenceRows } = await supabaseAdmin
        .from("class_presence")
        .select("class_id")
        .in("class_id", classIds);

      for (const row of presenceRows ?? []) {
        const cid = String(row.class_id ?? "").trim();
        if (!cid) continue;
        presenceCountByClass.set(cid, (presenceCountByClass.get(cid) ?? 0) + 1);
      }
    }

    const splitCountByClass = new Map<string, number>();

    if (classIds.length > 0) {
      const { data: classSessions } = await supabaseAdmin
        .from("sessions")
        .select("id, class_id, status")
        .in("class_id", classIds);

      const activeSessionIdsByClass = new Map<string, string[]>();

      for (const row of classSessions ?? []) {
        const cid = String(row.class_id ?? "").trim();
        const sid = String(row.id ?? "").trim();
        if (!cid || !sid || isClosedStatus(row.status)) continue;

        const count = memberCountBySessionId.get(sid) ?? 0;
        if (count <= 0) continue;

        const list = activeSessionIdsByClass.get(cid) ?? [];
        list.push(sid);
        activeSessionIdsByClass.set(cid, list);
      }

      for (const [cid, sessionList] of activeSessionIdsByClass) {
        if (sessionList.length > 1) {
          splitCountByClass.set(cid, sessionList.length);
        }
      }
    }

    const rooms: RoomDto[] = sessionsWithMembers.map((session) => {
      const sid = String(session.id);
      const cls = session.class_id
        ? classById.get(String(session.class_id))
        : undefined;

      const rawMembers = membersBySession.get(sid) ?? [];

      const uniqueMembersMap = new Map<string, RoomMemberDto>();
      for (const m of rawMembers) {
        if (!uniqueMembersMap.has(m.device_id)) {
          uniqueMembersMap.set(m.device_id, m);
        }
      }

      const roomMembers = Array.from(uniqueMembersMap.values());
      const member_count = memberCountBySessionId.get(sid) ?? roomMembers.length;

      const classId = session.class_id ? String(session.class_id) : "";
      let repair_summary: RoomRepairSummary | null = null;

      if (classId) {
        const membershipDevices = membershipDeviceByClass.get(classId) ?? new Set();
        const members_missing_membership = roomMembers.filter(
          (m) => !membershipDevices.has(m.device_id)
        ).length;

        repair_summary = {
          class_memberships: membershipCountByClass.get(classId) ?? 0,
          session_members: member_count,
          class_presence: presenceCountByClass.get(classId) ?? 0,
          members_missing_membership,
          possible_split_sessions: splitCountByClass.get(classId) ?? 0,
        };
      }

      const report_count = 0;
      const short_leave_count = 0;
      const join_leave_burst_count = Math.max(
        0,
        rawMembers.length - roomMembers.length
      );
      const block_count = 0;

      const risk_score =
        report_count * 3 +
        short_leave_count * 2 +
        join_leave_burst_count * 1 +
        block_count * 2;

      const created_at = session.created_at ?? null;
      const updated_at =
        latestMemberAtBySessionId.get(sid) ?? created_at;

      return {
        session_id: sid,
        class_id: session.class_id ? String(session.class_id) : null,
        class_name: cls?.name?.trim() || "（名称未設定）",
        world_key: cls?.world_key ?? null,
        topic_key: cls?.topic_key ?? null,
        status: session.status?.trim() || "unknown",
        member_count,
        members: roomMembers,
        repair_summary,
        started_at: created_at,
        created_at,
        updated_at,
        elapsed_minutes: diffMinutesFromNow(created_at),
        report_count,
        short_leave_count,
        join_leave_burst_count,
        block_count,
        risk_score,
        risk_level: calcRiskLevel(risk_score),
      };
    });

    console.log("[admin/rooms] rooms result", {
      count: rooms.length,
      rooms: rooms.map((r) => ({
        sessionId: r.session_id,
        classId: r.class_id,
        status: r.status,
        memberCount: r.member_count,
        worldKey: r.world_key,
        topicKey: r.topic_key,
      })),
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
