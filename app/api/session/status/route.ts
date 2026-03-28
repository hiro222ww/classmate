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

export const dynamic = "force-dynamic";

type MemberRow = {
  device_id?: string | null;
  display_name?: string | null;
  joined_at?: string | null;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionIdRaw = (searchParams.get("sessionId") ?? "").trim();

    if (!sessionIdRaw) {
      return NextResponse.json(
        { ok: false, error: "missing_sessionId" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { ok: false, error: s.error.message },
        { status: 500 }
      );
    }

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
      .select("device_id, display_name, joined_at")
      .eq("session_id", sessionIdRaw)
      .order("joined_at", { ascending: true });

    if (m.error) {
      return NextResponse.json(
        { ok: false, error: m.error.message },
        { status: 500 }
      );
    }

    const rawMembers = (Array.isArray(m.data) ? m.data : []) as MemberRow[];

    // device_id があるものを最優先で一意化
    const byDevice = new Map<
      string,
      { device_id?: string; display_name: string; joined_at: string }
    >();

    // device_id がない古いゴミ行は display_name 単位で1件だけ残す
    const byNameWithoutDevice = new Map<
      string,
      { device_id?: string; display_name: string; joined_at: string }
    >();

    for (const row of rawMembers) {
      const deviceId = String(row.device_id ?? "").trim();
      const displayName = String(row.display_name ?? "").trim() || "You";
      const joinedAt = String(row.joined_at ?? "").trim() || new Date(0).toISOString();

      if (deviceId) {
        const prev = byDevice.get(deviceId);

        // 同じ device_id が複数あったら joined_at が新しい方を残す
        if (!prev || joinedAt > prev.joined_at) {
          byDevice.set(deviceId, {
            device_id: deviceId,
            display_name: displayName,
            joined_at: joinedAt,
          });
        }
      } else {
        const key = displayName.toLowerCase();
        const prev = byNameWithoutDevice.get(key);

        // device_id なし行は display_name ごとに1件だけ
        if (!prev || joinedAt > prev.joined_at) {
          byNameWithoutDevice.set(key, {
            device_id: undefined,
            display_name: displayName,
            joined_at: joinedAt,
          });
        }
      }
    }

    const members = [
      ...Array.from(byDevice.values()),
      ...Array.from(byNameWithoutDevice.values()).filter((ghost) => {
        // 既に同名の device_id ありメンバーがいるなら、ghost は捨てる
        return !Array.from(byDevice.values()).some(
          (real) =>
            real.display_name.trim().toLowerCase() ===
            ghost.display_name.trim().toLowerCase()
        );
      }),
    ].sort((a, b) => a.joined_at.localeCompare(b.joined_at));

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