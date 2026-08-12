import { NextRequest, NextResponse } from "next/server";
import { upsertClassPresenceGuarded } from "@/lib/presenceRoomUpsert";

function normalizePresenceStatus(
  value: string
): "waiting" | "calling" | "offline" {
  const normalized = value.trim().toLowerCase();

  if (normalized === "call") {
    return "calling";
  }

  if (normalized === "room") {
    return "waiting";
  }

  if (normalized === "home") {
    return "offline";
  }

  return "offline";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const classId = String(body.class_id ?? body.classId ?? "").trim();
    const deviceId = String(body.device_id ?? body.deviceId ?? "").trim();
    const screen = String(body.screen ?? "").trim() || "home";
    const sessionId =
      String(body.session_id ?? body.sessionId ?? "").trim() || null;
    const source =
      String(body.source ?? "").trim() || "api.class.presence.unattributed";
    const reason = String(body.reason ?? "").trim() || "unspecified";
    const visibilityState =
      String(body.visibilityState ?? "").trim() || "unknown";
    const pathname = String(body.pathname ?? "").trim() || "unknown";
    const explicitLeave = body.explicitLeave === true;

    if (!classId || !deviceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_params",
        },
        { status: 400 }
      );
    }

    const status = normalizePresenceStatus(screen);

    if (screen !== "room") {
      console.log("[presence POST]", {
        class_id: classId,
        device_id: deviceId,
        screen,
        status,
        session_id: sessionId,
        source,
        reason,
        visibilityState,
        pathname,
      });
    }

    const result = await upsertClassPresenceGuarded({
      classId,
      deviceId,
      sessionId,
      screen,
      status,
      source,
      reason,
      explicitLeave,
      visibilityState,
      pathname,
    });

    if (!result.ok) {
      console.error("[presence POST] error", result.error);
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
        },
        { status: 500 }
      );
    }

    if (!result.applied && result.ignored) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: result.reason,
      });
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (e: unknown) {
    console.error("[presence POST] fatal", e);

    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "unknown_error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const classId = searchParams.get("classId");

    if (!classId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_classId",
        },
        { status: 400 }
      );
    }

    const now = Date.now();
    const activeMs = 1000 * 60 * 2;

    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data, error } = await supabaseAdmin
      .from("class_presence")
      .select("*")
      .eq("class_id", classId);

    if (error) {
      console.error("[presence GET] error", error);

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const filtered = (data ?? []).map((row: Record<string, unknown>) => {
      const last = new Date(String(row.last_seen_at ?? "")).getTime();
      const active = now - last <= activeMs;

      return {
        ...row,
        active,
        effective_status: active ? row.status : "offline",
      };
    });

    return NextResponse.json({
      ok: true,
      items: filtered,
      presence: filtered,
    });
  } catch (e: unknown) {
    console.error("[presence GET] fatal", e);

    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "unknown_error",
      },
      { status: 500 }
    );
  }
}
