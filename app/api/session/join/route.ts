import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

function buildTopicLabelFromClass(cls: any) {
  const rawName = String(cls?.name ?? "").trim();
  const topicKey = String(cls?.topic_key ?? "").trim();

  if (rawName) return rawName;
  if (!topicKey) return "フリークラス";
  if (topicKey === "free") return "フリークラス";
  return topicKey;
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

async function ensureSessionRow(params: {
  sessionId: string;
  topic: string;
  capacity: number;
  classId?: string | null;
}) {
  const { sessionId, topic, capacity, classId } = params;

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("sessions")
    .select("id, topic, capacity, status, class_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (existingErr) {
    return { ok: false as const, error: existingErr };
  }

  if (existing) {
    const updates: Record<string, any> = {};

    if ((!existing.topic || existing.topic === "free") && topic) {
      updates.topic = topic;
    }

    if ((!existing.capacity || Number(existing.capacity) <= 0) && capacity > 0) {
      updates.capacity = capacity;
    }

    if (!existing.class_id && classId) {
      updates.class_id = classId;
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

    return { ok: true as const };
  }

  const { error: insertErr } = await supabaseAdmin.from("sessions").insert({
    id: sessionId,
    class_id: classId ?? null,
    topic,
    status: "forming",
    capacity: capacity > 0 ? capacity : 5,
  });

  if (insertErr) {
    const code = (insertErr as any)?.code ?? "";
    if (code !== "23505") {
      return { ok: false as const, error: insertErr };
    }
  }

  return { ok: true as const };
}

async function findOrCreateFormingSession(params: {
  classId: string;
  topic: string;
  capacity: number;
}) {
  const { classId, topic, capacity } = params;

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("sessions")
    .select("id, topic, capacity, status, class_id, created_at")
    .eq("class_id", classId)
    .eq("status", "forming")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    return { ok: false as const, error: findErr };
  }

  if (existing?.id) {
    const ensured = await ensureSessionRow({
      sessionId: existing.id,
      topic,
      capacity,
      classId,
    });

    if (!ensured.ok) return ensured;

    return {
      ok: true as const,
      sessionId: existing.id,
    };
  }

  const sessionId = randomUUID();

  const ensured = await ensureSessionRow({
    sessionId,
    topic,
    capacity,
    classId,
  });

  if (!ensured.ok) return ensured;

  return {
    ok: true as const,
    sessionId,
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

    // ① classId 指定のときは、その class の forming session を再利用する
    if (classIdRaw) {
      let resolvedTopic = topic;

      const { data: cls, error: clsErr } = await supabaseAdmin
        .from("classes")
        .select("id, name, topic_key, world_key")
        .eq("id", classIdRaw)
        .maybeSingle();

      if (clsErr) {
        console.error("[session/join] class lookup error:", clsErr);
        return NextResponse.json(
          { ok: false, error: clsErr.message },
          { status: 500 }
        );
      }

      if (cls) {
        resolvedTopic = buildTopicLabelFromClass(cls);
      } else {
        resolvedTopic = resolvedTopic || "クラス";
      }

      const found = await findOrCreateFormingSession({
        classId: classIdRaw,
        topic: resolvedTopic,
        capacity: resolvedCapacity,
      });

      if (!found.ok) {
        console.error("[session/join] find/create session error:", found.error);
        return NextResponse.json(
          {
            ok: false,
            error: found.error?.message ?? "find_or_create_session_failed",
          },
          { status: 500 }
        );
      }

      const sessionId = found.sessionId;

      const { error: memberErr } = await upsertMember(sessionId, deviceId, name);
      if (memberErr) {
        console.error("[session/join] member upsert error:", memberErr);
        return NextResponse.json(
          { ok: false, error: memberErr.message },
          { status: 500 }
        );
      }

      const { count, error: countErr } = await supabaseAdmin
        .from("session_members")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId);

      if (countErr) {
        console.error("[session/join] member count error:", countErr);
        return NextResponse.json(
          { ok: false, error: countErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        sessionId,
        topic: resolvedTopic,
        capacity: resolvedCapacity,
        memberCount: Number(count ?? 0),
        status: "forming",
      });
    }

    // ② sessionId 指定のときは、その session に参加
    if (sessionIdRaw) {
      if (!isUuid(sessionIdRaw)) {
        return NextResponse.json(
          { ok: false, error: "sessionId must be uuid" },
          { status: 400 }
        );
      }

      const resolvedTopic = topic || "クラス";

      const ensured = await ensureSessionRow({
        sessionId: sessionIdRaw,
        topic: resolvedTopic,
        capacity: resolvedCapacity,
        classId: null,
      });

      if (!ensured.ok) {
        console.error("[session/join] ensure session error:", ensured.error);
        return NextResponse.json(
          { ok: false, error: ensured.error.message ?? "ensure_session_failed" },
          { status: 500 }
        );
      }

      const { error: memberErr } = await upsertMember(
        sessionIdRaw,
        deviceId,
        name
      );

      if (memberErr) {
        console.error("[session/join] member upsert error:", memberErr);
        return NextResponse.json(
          { ok: false, error: memberErr.message },
          { status: 500 }
        );
      }

      const { count, error: countErr } = await supabaseAdmin
        .from("session_members")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionIdRaw);

      if (countErr) {
        console.error("[session/join] member count error:", countErr);
        return NextResponse.json(
          { ok: false, error: countErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        sessionId: sessionIdRaw,
        topic: resolvedTopic,
        capacity: resolvedCapacity,
        memberCount: Number(count ?? 0),
        status: "forming",
      });
    }

    // ③ topic から直接入る旧用途
    if (!topic || !Number.isFinite(capacity) || capacity <= 0) {
      return NextResponse.json(
        { ok: false, error: "missing or invalid fields" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("join_or_create_session", {
      p_topic: topic,
      p_name: name,
      p_capacity: capacity,
    });

    if (error) {
      console.error("[session/join] RPC error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { ok: false, error: "no session returned" },
        { status: 500 }
      );
    }

    const row = data[0] as any;

    const sessionId = String(row.session_id ?? "");
    const status = String(row.status ?? "forming");
    const memberCount = Number(row.member_count ?? 0);
    const cap = Number(row.capacity ?? capacity);

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "session_id missing from rpc result" },
        { status: 500 }
      );
    }

    const { error: upsertErr } = await upsertMember(sessionId, deviceId, name);
    if (upsertErr) {
      console.error("[session/join] member upsert error after rpc:", upsertErr);
      return NextResponse.json(
        { ok: false, error: upsertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      status,
      memberCount,
      capacity: cap,
    });
  } catch (e: any) {
    console.error("[session/join] server error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}