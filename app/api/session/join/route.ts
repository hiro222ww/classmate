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
  if (!s || s === "You" || s === "undefined" || s === "null") return "参加者";
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
    return { ok: false as const, error: new Error("session_not_found") };
  }

  if (existing.status === "closed" || existing.status === "ended") {
    return { ok: false as const, error: new Error("session_closed") };
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

async function countMembers(sessionId: string) {
  const { count, error } = await supabaseAdmin
    .from("session_members")
    .select("device_id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (error) return { ok: false as const, error };

  return { ok: true as const, count: Number(count ?? 0) };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const sessionIdRaw = String(
      body.sessionId ?? body.session_id ?? body.session ?? ""
    ).trim();

    const classIdRaw = String(
      body.classId ?? body.class_id ?? body.class ?? ""
    ).trim();

    const rawName = String(body.name ?? body.displayName ?? "").trim();
    const name = sanitizeDisplayName(rawName);

    const deviceId = String(body.deviceId ?? body.device_id ?? "").trim();

    const capacity = Number(body.capacity ?? 0);
    const invite = Boolean(body.invite);

    console.log("[session/join] parsed", {
      sessionIdRaw,
      classIdRaw,
      deviceId,
      name,
      invite,
    });

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

    const ensured = await ensureJoinableSession({
      sessionId: sessionIdRaw,
      capacity: capacity || 5,
    });

    if (!ensured.ok) {
      return NextResponse.json(
        { ok: false, error: ensured.error.message },
        { status: 400 }
      );
    }

    const session = ensured.session;

    if (String(session.class_id ?? "").trim() !== classIdRaw) {
      return NextResponse.json(
        { ok: false, error: "session_class_mismatch" },
        { status: 400 }
      );
    }

    const existingSessionMember = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionIdRaw)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (existingSessionMember.error) {
      return NextResponse.json(
        { ok: false, error: existingSessionMember.error.message },
        { status: 500 }
      );
    }

    if (existingSessionMember.data) {
      console.log("[session/join] already in session");

      return NextResponse.json({
        ok: true,
        sessionId: sessionIdRaw,
        classId: classIdRaw,
        alreadyInSession: true,
      });
    }

    const countRes = await countMembers(sessionIdRaw);

    if (!countRes.ok) {
      return NextResponse.json(
        { ok: false, error: countRes.error.message },
        { status: 500 }
      );
    }

    if (countRes.count >= session.capacity) {
      return NextResponse.json(
        { ok: false, error: "session_full" },
        { status: 409 }
      );
    }

    // ===== クラス枠チェック =====
    // 招待参加でも、未所属クラスなら class_slots を消費する。
    // すでに同じクラスに所属済みなら枠は消費しない。

    const { data: ent, error: entErr } = await supabaseAdmin
      .from("user_entitlements")
      .select("class_slots")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (entErr) {
      return NextResponse.json(
        { ok: false, error: entErr.message },
        { status: 500 }
      );
    }

    const classSlots = Math.max(1, Number(ent?.class_slots ?? 1));

    const { data: mine, error: mineErr } = await supabaseAdmin
      .from("class_memberships")
      .select("class_id")
      .eq("device_id", deviceId);

    if (mineErr) {
      return NextResponse.json(
        { ok: false, error: mineErr.message },
        { status: 500 }
      );
    }

    const joinedClassIds = (mine ?? [])
      .map((m: any) => String(m.class_id ?? "").trim())
      .filter(Boolean);

    const alreadyInClass = joinedClassIds.includes(classIdRaw);

    if (!alreadyInClass && joinedClassIds.length >= classSlots) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: joinedClassIds.length,
          classSlots,
        },
        { status: 403 }
      );
    }

    // ===== session_members 追加 =====

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
      console.error("[session/join] member error", memberErr);
      return NextResponse.json(
        { ok: false, error: memberErr.message },
        { status: 500 }
      );
    }

    // ===== class_memberships 追加 =====

    const { error: membershipErr } = await supabaseAdmin
      .from("class_memberships")
      .upsert(
        {
          class_id: classIdRaw,
          device_id: deviceId,
          joined_at: new Date().toISOString(),
        },
        { onConflict: "class_id,device_id" }
      );

    if (membershipErr) {
      console.error("[session/join] membership error", membershipErr);
      return NextResponse.json(
        { ok: false, error: membershipErr.message },
        { status: 500 }
      );
    }

    // ===== presence 更新 =====

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
      topic: session.topic || "クラス",
      capacity: session.capacity,
      memberCount: countRes.count + 1,
      status: session.status,
      invite,
      classSlots,
      alreadyInClass,
    });
  } catch (e: any) {
    console.error("[session/join] server error:", e);

    return NextResponse.json(
      { ok: false, error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}