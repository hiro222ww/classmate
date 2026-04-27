import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ======================
// utils
// ======================

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    s
  );
}

// 🔥 これが今回の核心（壊れたsessionId救済）
function extractUuid(v: unknown) {
  const s = String(v ?? "").trim();
  const m = s.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}/i
  );
  return m?.[0] ?? "";
}

function sanitizeDisplayName(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "You" || s === "undefined" || s === "null") return "参加者";
  return s;
}

// ======================
// session ensure
// ======================

async function ensureJoinableSession(params: {
  sessionId: string;
  capacity: number;
}) {
  const { sessionId, capacity } = params;

  const { data: existing, error } = await supabaseAdmin
    .from("sessions")
    .select("id, capacity, status, class_id, topic")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) return { ok: false as const, error };

  if (!existing) {
    return { ok: false as const, error: new Error("session_not_found") };
  }

  if (existing.status === "closed" || existing.status === "ended") {
    return { ok: false as const, error: new Error("session_closed") };
  }

  return {
    ok: true as const,
    session: {
      id: String(existing.id),
      class_id: existing.class_id ?? null,
      topic: String(existing.topic ?? "").trim(),
      capacity: Number(existing.capacity ?? capacity ?? 5),
      status: String(existing.status ?? "forming"),
    },
  };
}

// ======================
// main
// ======================

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const url = new URL(req.url);

    const sessionIdRaw = extractUuid(
  body.sessionId ??
    body.session_id ??
    body.session ??
    body.sessionID ??
    body.roomSessionId ??
    body.session_id_raw ??
    url.searchParams.get("sessionId") ??
    url.searchParams.get("session_id") ??
    url.searchParams.get("session")
);

    const deviceId = String(
      body.deviceId ?? body.device_id ?? ""
    ).trim();

    const rawName = String(body.name ?? "").trim();
    const name = sanitizeDisplayName(rawName);

    const invite = Boolean(body.invite);

    console.log("[session/join]", {
      sessionIdRaw,
      deviceId,
      name,
      invite,
    });

    if (!sessionIdRaw || !isUuid(sessionIdRaw)) {
      return NextResponse.json(
        { ok: false, error: "invalid_sessionId" },
        { status: 400 }
      );
    }

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "deviceId required" },
        { status: 400 }
      );
    }

    const ensured = await ensureJoinableSession({
      sessionId: sessionIdRaw,
      capacity: 5,
    });

    if (!ensured.ok) {
      return NextResponse.json(
        { ok: false, error: ensured.error.message },
        { status: 400 }
      );
    }

    const session = ensured.session;
    const classIdRaw = String(session.class_id ?? "").trim();

    if (!classIdRaw) {
      return NextResponse.json(
        { ok: false, error: "session_class_missing" },
        { status: 400 }
      );
    }

    // ======================
    // member upsert
    // ======================

    const { error: memberErr } = await supabaseAdmin
      .from("session_members")
      .upsert(
        {
          session_id: sessionIdRaw,
          device_id: deviceId,
          display_name: name,
          joined_at: new Date().toISOString(),
        },
        { onConflict: "session_id,device_id" }
      );

    if (memberErr) {
      return NextResponse.json(
        { ok: false, error: memberErr.message },
        { status: 500 }
      );
    }

    // ======================
    // class membership
    // ======================

    await supabaseAdmin.from("class_memberships").upsert(
      {
        class_id: classIdRaw,
        device_id: deviceId,
        joined_at: new Date().toISOString(),
      },
      { onConflict: "class_id,device_id" }
    );

    // ======================
    // presence
    // ======================

    await supabaseAdmin.from("class_presence").upsert(
      {
        class_id: classIdRaw,
        device_id: deviceId,
        session_id: sessionIdRaw,
        status: session.status === "active" ? "active" : "waiting",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "class_id,device_id" }
    );

    return NextResponse.json({
      ok: true,
      sessionId: sessionIdRaw,
      classId: classIdRaw,
      status: session.status,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}