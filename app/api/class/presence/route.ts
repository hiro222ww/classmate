import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function normalizePresenceStatus(
  value: string
): "waiting" | "calling" | "offline" {
  const normalized = value.trim().toLowerCase();

  if (normalized === "call") {
    return "calling";
  }

  // 修正前:
  // if (normalized === "room" || normalized === "home") {
  //   return "waiting";
  // }

  // 修正後:
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

    const classId = String(
      body.class_id ?? ""
    ).trim();

    const deviceId = String(
      body.device_id ?? ""
    ).trim();

    // 修正前:
    // const screen =
    //   String(body.screen ?? "").trim() || "room";

    // 修正後:
    const screen =
      String(body.screen ?? "").trim() || "home";

    const sessionId =
      String(
        body.session_id ?? ""
      ).trim() || null;

    if (!classId || !deviceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_params",
        },
        { status: 400 }
      );
    }

    const status =
      normalizePresenceStatus(screen);

    // 修正前:
    /*
    const payload = {
      class_id: classId,
      device_id: deviceId,
      screen,
      status,
      session_id: sessionId,
      last_seen_at: new Date().toISOString(),
    };
    */

    // 修正後:
    const payload: Record<
      string,
      any
    > = {
      class_id: classId,
      device_id: deviceId,
      screen,
      status,
      last_seen_at:
        new Date().toISOString(),
    };

    // nullで既存session_idを消さない
    if (sessionId) {
      payload.session_id = sessionId;
    }

    console.log(
      "[presence POST]",
      payload
    );

    const { error } =
      await supabaseAdmin
        .from("class_presence")
        .upsert(payload, {
          onConflict:
            "class_id,device_id",
        });

    if (error) {
      console.error(
        "[presence POST] error",
        error
      );

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
  } catch (e: any) {
    console.error(
      "[presence POST] fatal",
      e
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          e?.message ??
          "unknown_error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } =
      new URL(req.url);

    const classId =
      searchParams.get("classId");

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

    const activeMs =
      1000 * 60 * 2;

    const { data, error } =
      await supabaseAdmin
        .from("class_presence")
        .select("*")
        .eq("class_id", classId);

    if (error) {
      console.error(
        "[presence GET] error",
        error
      );

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const filtered = (
      data ?? []
    ).map((row: any) => {
      const last = new Date(
        row.last_seen_at
      ).getTime();

      const active =
        now - last <= activeMs;

      return {
        ...row,
        active,
        effective_status: active
          ? row.status
          : "offline",
      };
    });

    return NextResponse.json({
      ok: true,
      items: filtered,
    });
  } catch (e: any) {
    console.error(
      "[presence GET] fatal",
      e
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          e?.message ??
          "unknown_error",
      },
      { status: 500 }
    );
  }
}