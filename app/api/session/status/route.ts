import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionIdRaw = (searchParams.get("sessionId") ?? "").trim();

    if (!sessionIdRaw) {
      return NextResponse.json({ ok: false, error: "missing_sessionId" }, { status: 400 });
    }

    if (!isUuid(sessionIdRaw)) {
      return NextResponse.json(
        { ok: false, error: `invalid_sessionId (uuid required): ${sessionIdRaw}` },
        { status: 400 }
      );
    }

    const sb = admin();

    const s = await sb
      .from("sessions")
      .select("id, topic, status, capacity, created_at")
      .eq("id", sessionIdRaw)
      .maybeSingle();

    if (s.error) {
      return NextResponse.json({ ok: false, error: s.error.message }, { status: 500 });
    }

    // 勝手に free session を作らない
    if (!s.data) {
      return NextResponse.json({
        ok: true,
        session: {
          id: sessionIdRaw,
          topic: "",
          status: "forming",
          capacity: 5,
          created_at: null,
        },
        members: [],
        memberCount: 0,
      });
    }

    const m = await sb
      .from("session_members")
      .select("display_name, joined_at")
      .eq("session_id", sessionIdRaw)
      .order("joined_at", { ascending: true });

    if (m.error) {
      return NextResponse.json({ ok: false, error: m.error.message }, { status: 500 });
    }

    const members = Array.isArray(m.data) ? m.data : [];
    const memberCount = members.length;

    return NextResponse.json({
      ok: true,
      session: s.data,
      members,
      memberCount,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "status_failed" },
      { status: 500 }
    );
  }
}