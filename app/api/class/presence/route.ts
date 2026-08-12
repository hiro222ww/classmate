import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logPresenceScreenWrite } from "@/lib/presenceScreenWriteLog";
import { decideRoomPresenceOverwrite } from "@/lib/presenceRoomOverwriteGuard";

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

async function lookupSessionMemberInCall(params: {
  sessionId: string;
  deviceId: string;
}): Promise<boolean | null> {
  const { data, error } = await supabaseAdmin
    .from("session_members")
    .select("is_in_call")
    .eq("session_id", params.sessionId)
    .eq("device_id", params.deviceId)
    .maybeSingle();

  if (error) {
    console.warn("[presence POST] in_call lookup failed", error.message);
    return null;
  }

  if (!data) return null;
  return data.is_in_call === true;
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

    let sessionMemberInCall: boolean | null = null;
    if (screen === "room" && sessionId && !explicitLeave) {
      sessionMemberInCall = await lookupSessionMemberInCall({
        sessionId,
        deviceId,
      });
    }

    const overwrite = decideRoomPresenceOverwrite({
      screen,
      source,
      explicitLeave,
      sessionId,
      sessionMemberInCall,
    });

    if (overwrite.ignore) {
      console.log(
        `[presence-screen] ignore screen=room source=${source} ` +
          `reason=${overwrite.reason ?? "guard"} ` +
          `sessionId=${sessionId?.slice(-8) ?? "-"} ` +
          `deviceId=${deviceId.slice(-6)} ` +
          `visibilityState=${visibilityState} ` +
          `pathname=${pathname} explicitLeave=0`
      );
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: overwrite.reason,
      });
    }

    const status = normalizePresenceStatus(screen);

    const payload: Record<string, unknown> = {
      class_id: classId,
      device_id: deviceId,
      screen,
      status,
      last_seen_at: new Date().toISOString(),
    };

    // nullで既存session_idを消さない
    if (sessionId) {
      payload.session_id = sessionId;
    }

    if (screen === "room") {
      logPresenceScreenWrite({
        source,
        reason,
        screen: "room",
        classId,
        sessionId,
        deviceId,
        visibilityState,
        pathname,
        explicitLeave,
      });
    } else {
      console.log("[presence POST]", {
        ...payload,
        source,
        reason,
        visibilityState,
        pathname,
      });
    }

    const { error } = await supabaseAdmin.from("class_presence").upsert(payload, {
      onConflict: "class_id,device_id",
    });

    if (error) {
      console.error("[presence POST] error", error);

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
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
