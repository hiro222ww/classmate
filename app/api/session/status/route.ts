import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("missing_supabase_service_role");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const dynamic = "force-dynamic";

type SessionMemberRow = {
  device_id?: string | null;
  display_name?: string | null;
  joined_at?: string | null;
};

function sanitizeDisplayName(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "You") return "参加者";
  return s;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionIdRaw = (searchParams.get("sessionId") ?? "").trim();
    const classIdRaw = (searchParams.get("classId") ?? "").trim();

    if (!sessionIdRaw) {
      return NextResponse.json(
        { ok: false, error: "missing_sessionId" },
        { status: 400 }
      );
    }

    if (!classIdRaw) {
      return NextResponse.json(
        { ok: false, error: "missing_classId" },
        { status: 400 }
      );
    }

    if (!isUuid(sessionIdRaw)) {
      return NextResponse.json(
        {
          ok: false,
          error: `invalid_sessionId (uuid required): ${sessionIdRaw}`,
        },
        { status: 400 }
      );
    }

    if (!isUuid(classIdRaw)) {
      return NextResponse.json(
        {
          ok: false,
          error: `invalid_classId (uuid required): ${classIdRaw}`,
        },
        { status: 400 }
      );
    }

    const sb = admin();

    const s = await sb
      .from("sessions")
      .select("id, class_id, topic, status, capacity, created_at")
      .eq("id", sessionIdRaw)
      .maybeSingle();

    if (s.error) {
      return NextResponse.json(
        { ok: false, error: s.error.message },
        { status: 500 }
      );
    }

    if (!s.data) {
      return NextResponse.json(
        { ok: false, error: "session_not_found" },
        { status: 404 }
      );
    }

    if (String(s.data.class_id ?? "").trim() !== classIdRaw) {
      console.warn("[session/status] class mismatch", {
        sessionIdRaw,
        classIdRaw,
        sessionClassId: String(s.data.class_id ?? "").trim(),
      });
    }

    const m = await sb
      .from("session_members")
      .select("device_id, display_name, joined_at")
      .eq("session_id", sessionIdRaw)
      .not("device_id", "is", null)
      .neq("device_id", "")
      .order("joined_at", { ascending: true });

    if (m.error) {
      return NextResponse.json(
        { ok: false, error: m.error.message },
        { status: 500 }
      );
    }

    const rawMembers = (Array.isArray(m.data) ? m.data : []) as SessionMemberRow[];

    const byDevice = new Map<
      string,
      {
        device_id: string;
        display_name: string;
        photo_path: null;
        avatar_url: null;
        joined_at: string;
      }
    >();

    for (const row of rawMembers) {
      const deviceId = String(row.device_id ?? "").trim();
      if (!deviceId) continue;

      const displayName = sanitizeDisplayName(row.display_name);
      const joinedAt =
        String(row.joined_at ?? "").trim() || new Date(0).toISOString();

      const prev = byDevice.get(deviceId);

      if (!prev || joinedAt < prev.joined_at) {
        byDevice.set(deviceId, {
          device_id: deviceId,
          display_name: displayName,
          photo_path: null,
          avatar_url: null,
          joined_at: joinedAt,
        });
      }
    }

    const members = Array.from(byDevice.values()).sort((a, b) =>
      a.joined_at.localeCompare(b.joined_at)
    );

    return NextResponse.json(
      {
        ok: true,
        session: {
          id: String(s.data.id),
          class_id: String(s.data.class_id ?? ""),
          topic: String(s.data.topic ?? "").trim(),
          status: String(s.data.status ?? "forming"),
          capacity: Number(s.data.capacity ?? 5),
          created_at: s.data.created_at ?? null,
        },
        members,
        memberCount: members.length,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "status_failed" },
      { status: 500 }
    );
  }
}