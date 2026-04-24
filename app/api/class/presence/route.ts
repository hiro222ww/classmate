import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type PresenceStatus = "offline" | "waiting" | "active";

const ONLINE_WINDOW_MS = 15000;

function getPresenceStatus(params: {
  lastSeenAt?: string | null;
  screen?: string | null;
  sessionId?: string | null;
}) {
  const { lastSeenAt, screen, sessionId } = params;

  if (!lastSeenAt) return "offline";

  const ts = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ts)) return "offline";

  const alive = Date.now() - ts <= ONLINE_WINDOW_MS;
  if (!alive) return "offline";

  // 🔥 最優先：session_id があるなら通話中
  if (sessionId) {
    return "active";
  }

  const normalized = String(screen ?? "").trim().toLowerCase();

  if (normalized === "call") {
    return "active";
  }

  if (normalized === "room" || normalized === "home") {
    return "waiting";
  }

  // 🔥 不明値でもオンライン扱い（安全側）
  return "waiting";
}

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

    const { data: presenceRows, error: presenceError } = await sb
      .from("class_presence")
      .select("device_id, screen, session_id, last_seen_at")
      .eq("class_id", classId)
      .in("device_id", memberIds);

    if (presenceError) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_presence_lookup_failed",
          detail: presenceError.message,
        },
        { status: 500 }
      );
    }

    const byDevice = new Map<
      string,
      {
        device_id: string;
        status: PresenceStatus;
        session_id: string | null;
        updated_at: string | null;
        screen: string | null;
      }
    >();

    for (const row of presenceRows ?? []) {
      const deviceId = String((row as any).device_id ?? "").trim();
      if (!deviceId) continue;

      const lastSeenAt = (row as any).last_seen_at ?? null;
      const screenRaw = String((row as any).screen ?? "").trim();
      const screen = screenRaw || null;

      const sessionId = (row as any).session_id
        ? String((row as any).session_id).trim()
        : null;

      const status = getPresenceStatus({
        lastSeenAt,
        screen,
        sessionId,
      });

      byDevice.set(deviceId, {
        device_id: deviceId,
        status,
        session_id: sessionId,
        updated_at: lastSeenAt,
        screen,
      });
    }

    const presence = memberIds.map((device_id) => {
      return (
        byDevice.get(device_id) ?? {
          device_id,
          status: "offline" as const,
          session_id: null,
          updated_at: null,
          screen: null,
        }
      );
    });

    return NextResponse.json({
      ok: true,
      presence,
      onlineWindowMs: ONLINE_WINDOW_MS,
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const classId = String(body.classId ?? "").trim();
    const deviceId = String(body.deviceId ?? "").trim();
    const screen = String(body.screen ?? "").trim() || "room";
    const sessionId = String(body.sessionId ?? "").trim() || null;

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "class_id_required" },
        { status: 400 }
      );
    }

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_required" },
        { status: 400 }
      );
    }

    const sb = supabaseServer();

    const payload = {
      class_id: classId,
      device_id: deviceId,
      screen,
      session_id: sessionId,
      last_seen_at: new Date().toISOString(),
    };

    console.log("[presence POST]", payload);

    const { error } = await sb
      .from("class_presence")
      .upsert(payload, {
        onConflict: "class_id,device_id",
      });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_presence_upsert_failed",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
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