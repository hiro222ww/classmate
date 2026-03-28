import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

async function cleanupGhostMembers(sessionId: string) {
  const { error } = await supabaseAdmin
    .from("session_members")
    .delete()
    .eq("session_id", sessionId)
    .or("device_id.is.null,device_id.eq.");

  if (error) {
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

  if (error) {
    return { ok: false as const, error };
  }

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

async function upsertMember(sessionId: string, deviceId: string, name: string) {
  return await supabaseAdmin.from("session_members").upsert(
    {
      session_id: sessionId,
      device_id: deviceId,
      display_name: name,
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

  if (error) {
    return { ok: false as const, error };
  }

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

  // closed の session には参加させない
  if (existing.status === "closed") {
    return {
      ok: false as const,
      error: new Error("session_closed"),
    };
  }

  // status が空なら forming を補う
  if (!existing.status) {
    updates.status = "forming";
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabaseAdmin
      .from("sessions")
      .update(updates)
      .eq("id", sessionId);

    if (updateErr) {
      return { ok: false as const, error: updateErr };
    }
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
    const topic = String(body.topic ?? "").trim();
    const name = String(body.name ?? "").trim();
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

    const resolvedCapacity =
      Number.isFinite(capacity) && capacity > 0 ? capacity : 5;

    // session/join は join only
    // classId だけで再マッチングするのは禁止
    if (!sessionIdRaw) {
      return NextResponse.json(
        {
          ok: false,
          error: "sessionId required",
          detail: "match-join で決定した sessionId を渡してください",
        },
        { status: 400 }
      );
    }

    if (!isUuid(sessionIdRaw)) {
      return NextResponse.json(
        { ok: false, error: "sessionId must be uuid" },
        { status: 400 }
      );
    }

    if (classIdRaw) {
      console.log("[session/join] classId was provided but ignored =", classIdRaw);
    }

    const ensured = await ensureJoinableSession({
      sessionId: sessionIdRaw,
      capacity: resolvedCapacity,
    });

    if (!ensured.ok) {
      console.error("[session/join] ensure session error:", ensured.error);
      const msg = ensured.error?.message ?? "ensure_session_failed";

      return NextResponse.json(
        { ok: false, error: msg },
        { status: msg === "session_not_found" ? 404 : 400 }
      );
    }

    const session = ensured.session;

    const cleaned = await cleanupGhostMembers(sessionIdRaw);
    if (!cleaned.ok) {
      return NextResponse.json(
        { ok: false, error: cleaned.error.message },
        { status: 500 }
      );
    }

    const countedBefore = await countValidMembers(sessionIdRaw);
    if (!countedBefore.ok) {
      console.error("[session/join] member count before join error:", countedBefore.error);
      return NextResponse.json(
        { ok: false, error: countedBefore.error.message },
        { status: 500 }
      );
    }

    const actualCapacity =
      Number.isFinite(session.capacity) && session.capacity > 0
        ? session.capacity
        : resolvedCapacity;

    // 既存人数が満員で、まだ本人が未参加なら弾く
    const { data: existingMine, error: mineErr } = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionIdRaw)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (mineErr) {
      console.error("[session/join] existing member lookup error:", mineErr);
      return NextResponse.json(
        { ok: false, error: mineErr.message },
        { status: 500 }
      );
    }

    const alreadyInSession = !!existingMine;

    if (!alreadyInSession && countedBefore.count >= actualCapacity) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_full",
          memberCount: countedBefore.count,
          capacity: actualCapacity,
        },
        { status: 400 }
      );
    }

    const { error: memberErr } = await upsertMember(sessionIdRaw, deviceId, name);
    if (memberErr) {
      console.error("[session/join] member upsert error:", memberErr);
      return NextResponse.json(
        { ok: false, error: memberErr.message },
        { status: 500 }
      );
    }

    const countedAfter = await countValidMembers(sessionIdRaw);
    if (!countedAfter.ok) {
      console.error("[session/join] member count after join error:", countedAfter.error);
      return NextResponse.json(
        { ok: false, error: countedAfter.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId: sessionIdRaw,
      classId: session.class_id,
      topic: session.topic || topic || "クラス",
      capacity: actualCapacity,
      memberCount: countedAfter.count,
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