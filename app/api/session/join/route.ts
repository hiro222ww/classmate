import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    s
  );
}

function sanitizeDisplayName(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "You") return "参加者";
  return s;
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

  if (existing.status === "closed" || existing.status === "ended") {
    return {
      ok: false as const,
      error: new Error("session_closed"),
    };
  }

  const updates: Record<string, any> = {};

  if ((!existing.capacity || Number(existing.capacity) <= 0) && capacity > 0) {
    updates.capacity = capacity;
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

async function getExistingMine(sessionId: string, deviceId: string) {
  const { data, error } = await supabaseAdmin
    .from("session_members")
    .select("device_id")
    .eq("session_id", sessionId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) return { ok: false as const, error };

  return {
    ok: true as const,
    alreadyInSession: !!data,
  };
}

async function countMembers(sessionId: string) {
  const { count, error } = await supabaseAdmin
    .from("session_members")
    .select("device_id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .not("device_id", "is", null)
    .neq("device_id", "");

  if (error) return { ok: false as const, error };

  return {
    ok: true as const,
    count: Number(count ?? 0),
  };
}

async function upsertSessionMember(params: {
  sessionId: string;
  deviceId: string;
  name: string;
}) {
  const { sessionId, deviceId, name } = params;
  const safeName = sanitizeDisplayName(name);

  const { error } = await supabaseAdmin.from("session_members").upsert(
    {
      session_id: sessionId,
      device_id: deviceId,
      display_name: safeName,
      joined_at: new Date().toISOString(),
    },
    { onConflict: "session_id,device_id" }
  );

  if (error) return { ok: false as const, error };
  return { ok: true as const };
}

async function upsertClassMembership(params: {
  classId: string;
  deviceId: string;
}) {
  const { classId, deviceId } = params;

  const { error } = await supabaseAdmin.from("class_memberships").upsert(
    {
      class_id: classId,
      device_id: deviceId,
      joined_at: new Date().toISOString(),
    },
    { onConflict: "class_id,device_id" }
  );

  if (error) return { ok: false as const, error };
  return { ok: true as const };
}

async function upsertClassPresence(params: {
  classId: string;
  sessionId: string;
  deviceId: string;
  status: "waiting" | "active";
}) {
  const { classId, sessionId, deviceId, status } = params;

  const { error } = await supabaseAdmin.from("class_presence").upsert(
    {
      class_id: classId,
      device_id: deviceId,
      status,
      session_id: sessionId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "class_id,device_id" }
  );

  if (error) return { ok: false as const, error };
  return { ok: true as const };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const sessionIdRaw = String(body.sessionId ?? "").trim();
    const classIdRaw = String(body.classId ?? "").trim();
    const rawName = String(body.name ?? body.displayName ?? "").trim();
    const name = sanitizeDisplayName(rawName);
    const deviceId = String(body.deviceId ?? "").trim();
    const capacity = Number(body.capacity ?? 0);
    const invite = Boolean(body.invite);

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

    const actualCapacity =
      Number.isFinite(session.capacity) && session.capacity > 0
        ? session.capacity
        : resolvedCapacity;

    const existingMineRes = await getExistingMine(sessionIdRaw, deviceId);

    if (!existingMineRes.ok) {
      return NextResponse.json(
        { ok: false, error: existingMineRes.error.message },
        { status: 500 }
      );
    }

    const alreadyInSession = existingMineRes.alreadyInSession;

    if (!alreadyInSession) {
      const countBeforeRes = await countMembers(sessionIdRaw);

      if (!countBeforeRes.ok) {
        return NextResponse.json(
          { ok: false, error: countBeforeRes.error.message },
          { status: 500 }
        );
      }

      if (countBeforeRes.count >= actualCapacity) {
        return NextResponse.json(
          { ok: false, error: "session_full" },
          { status: 409 }
        );
      }
    }

    // 通常参加の締切チェックを入れるならここ。
    // invite=true の招待参加は、sessionId固定で入れる想定。
    if (!invite) {
      // 例:
      // if (session.recruitment_closed) {
      //   return NextResponse.json(
      //     { ok: false, error: "session_recruitment_closed" },
      //     { status: 409 }
      //   );
      // }
    }

    const memberRes = await upsertSessionMember({
      sessionId: sessionIdRaw,
      deviceId,
      name,
    });

    if (!memberRes.ok) {
      return NextResponse.json(
        { ok: false, error: memberRes.error.message },
        { status: 500 }
      );
    }

    const membershipRes = await upsertClassMembership({
      classId: classIdRaw,
      deviceId,
    });

    if (!membershipRes.ok) {
      return NextResponse.json(
        { ok: false, error: membershipRes.error.message },
        { status: 500 }
      );
    }

    const presenceStatus =
      session.status === "active" ? "active" : "waiting";

    const presenceRes = await upsertClassPresence({
      classId: classIdRaw,
      sessionId: sessionIdRaw,
      deviceId,
      status: presenceStatus,
    });

    if (!presenceRes.ok) {
      return NextResponse.json(
        { ok: false, error: presenceRes.error.message },
        { status: 500 }
      );
    }

    const countAfterRes = await countMembers(sessionIdRaw);

    if (!countAfterRes.ok) {
      return NextResponse.json(
        { ok: false, error: countAfterRes.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId: sessionIdRaw,
      classId: classIdRaw,
      topic: session.topic || "クラス",
      capacity: actualCapacity,
      memberCount: countAfterRes.count,
      status: session.status || "forming",
      alreadyInSession,
      invite,
    });
  } catch (e: any) {
    console.error("[session/join] server error:", e);

    return NextResponse.json(
      { ok: false, error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}