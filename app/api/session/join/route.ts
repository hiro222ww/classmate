import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

function sanitizeDisplayName(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "You") return "参加者";
  return s;
}

async function cleanupGhostMembers(sessionId: string) {
  const { error } = await supabaseAdmin
    .from("session_members")
    .delete()
    .eq("session_id", sessionId)
    .or("device_id.is.null,device_id.eq.");

  if (error) return { ok: false as const, error };
  return { ok: true as const };
}

async function cleanupOldSelfRows(
  sessionId: string,
  deviceId: string,
  name: string
) {
  const trimmedName = sanitizeDisplayName(name);
  if (!trimmedName) return { ok: true as const };

  const { error } = await supabaseAdmin
    .from("session_members")
    .delete()
    .eq("session_id", sessionId)
    .eq("display_name", trimmedName)
    .neq("device_id", deviceId);

  if (error) {
    console.error("[session/join] cleanup old self rows error:", error);
    return { ok: false as const, error };
  }

  return { ok: true as const };
}

async function cleanupSameDeviceFromOtherSessions(
  sessionId: string,
  deviceId: string
) {
  const { error } = await supabaseAdmin
    .from("session_members")
    .delete()
    .eq("device_id", deviceId)
    .neq("session_id", sessionId);

  if (error) {
    console.error(
      "[session/join] cleanup same device from other sessions error:",
      error
    );
    return { ok: false as const, error };
  }

  return { ok: true as const };
}

async function countValidMembers(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from("session_members")
    .select("device_id")
    .eq("session_id", sessionId)
    .not("device_id", "is", null)
    .neq("device_id", "");

  if (error) return { ok: false as const, error };

  const uniqueIds = new Set(
    (data ?? [])
      .map((r: any) => String(r.device_id ?? "").trim())
      .filter(Boolean)
  );

  return {
    ok: true as const,
    count: uniqueIds.size,
  };
}

async function upsertMember(
  sessionId: string,
  deviceId: string,
  name: string
) {
  const safeName = sanitizeDisplayName(name);

  return await supabaseAdmin.from("session_members").upsert(
    {
      session_id: sessionId,
      device_id: deviceId,
      display_name: safeName,
      joined_at: new Date().toISOString(),
    },
    { onConflict: "session_id,device_id" }
  );
}

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
    return {
      ok: false as const,
      error: new Error("session_not_found"),
    };
  }

  const updates: Record<string, any> = {};

  if ((!existing.capacity || Number(existing.capacity) <= 0) && capacity > 0) {
    updates.capacity = capacity;
  }

  if (existing.status === "closed") {
    return {
      ok: false as const,
      error: new Error("session_closed"),
    };
  }

  if (!existing.status) {
    updates.status = "forming";
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabaseAdmin
      .from("sessions")
      .update(updates)
      .eq("id", sessionId);

    if (updateErr) return { ok: false as const, error: updateErr };
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const sessionIdRaw = String(body.sessionId ?? "").trim();
    const classIdRaw = String(body.classId ?? "").trim();
    const rawName = String(body.name ?? "").trim();
    const name = sanitizeDisplayName(rawName);
    const deviceId = String(body.deviceId ?? "").trim();
    const capacity = Number(body.capacity ?? 0);

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "name required" },
        { status: 400 }
      );
    }

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "deviceId required" },
        { status: 400 }
      );
    }

    if (!classIdRaw) {
      return NextResponse.json(
        { ok: false, error: "classId required" },
        { status: 400 }
      );
    }

    if (!sessionIdRaw) {
      return NextResponse.json(
        { ok: false, error: "sessionId required" },
        { status: 400 }
      );
    }

    if (!isUuid(sessionIdRaw)) {
      return NextResponse.json(
        { ok: false, error: "sessionId must be uuid" },
        { status: 400 }
      );
    }

    if (!isUuid(classIdRaw)) {
      return NextResponse.json(
        { ok: false, error: "classId must be uuid" },
        { status: 400 }
      );
    }

    const resolvedCapacity =
      Number.isFinite(capacity) && capacity > 0 ? capacity : 5;

    const ensured = await ensureJoinableSession({
      sessionId: sessionIdRaw,
      capacity: resolvedCapacity,
    });

    if (!ensured.ok) {
      const msg = ensured.error?.message ?? "ensure_session_failed";
      return NextResponse.json(
        { ok: false, error: msg },
        { status: msg === "session_not_found" ? 404 : 400 }
      );
    }

    const session = ensured.session;

    if (String(session.class_id ?? "").trim() !== classIdRaw) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_class_mismatch",
          sessionId: sessionIdRaw,
          classId: classIdRaw,
          sessionClassId: String(session.class_id ?? "").trim(),
        },
        { status: 400 }
      );
    }

    const ghostCleanup = await cleanupGhostMembers(sessionIdRaw);
    if (!ghostCleanup.ok) {
      return NextResponse.json(
        { ok: false, error: ghostCleanup.error.message },
        { status: 500 }
      );
    }

    const oldSelfCleanup = await cleanupOldSelfRows(sessionIdRaw, deviceId, name);
    if (!oldSelfCleanup.ok) {
      return NextResponse.json(
        { ok: false, error: oldSelfCleanup.error.message },
        { status: 500 }
      );
    }

    const otherSessionCleanup = await cleanupSameDeviceFromOtherSessions(
      sessionIdRaw,
      deviceId
    );
    if (!otherSessionCleanup.ok) {
      return NextResponse.json(
        { ok: false, error: otherSessionCleanup.error.message },
        { status: 500 }
      );
    }

    const countedBefore = await countValidMembers(sessionIdRaw);
    if (!countedBefore.ok) {
      return NextResponse.json(
        { ok: false, error: countedBefore.error.message },
        { status: 500 }
      );
    }

    const actualCapacity =
      Number.isFinite(session.capacity) && session.capacity > 0
        ? session.capacity
        : resolvedCapacity;

    const { data: existingMine, error: existingMineErr } = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionIdRaw)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (existingMineErr) {
      return NextResponse.json(
        { ok: false, error: existingMineErr.message },
        { status: 500 }
      );
    }

    const alreadyInSession = !!existingMine;

    if (!alreadyInSession && countedBefore.count >= actualCapacity) {
      return NextResponse.json(
        { ok: false, error: "session_full" },
        { status: 400 }
      );
    }

    const { error: memberErr } = await upsertMember(
      sessionIdRaw,
      deviceId,
      name
    );

    if (memberErr) {
      return NextResponse.json(
        { ok: false, error: memberErr.message },
        { status: 500 }
      );
    }

    const countedAfter = await countValidMembers(sessionIdRaw);

    return NextResponse.json({
      ok: true,
      sessionId: sessionIdRaw,
      classId: classIdRaw,
      topic: session.topic || "クラス",
      capacity: actualCapacity,
      memberCount: countedAfter.ok ? countedAfter.count : 1,
      status: session.status || "forming",
      alreadyInSession,
    });
  } catch (e: any) {
    console.error("[session/join] server error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}