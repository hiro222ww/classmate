// app/api/session/join/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function upsertMember(sessionId: string, name: string) {
  return await supabaseAdmin
    .from("session_members")
    .upsert(
      {
        session_id: sessionId,
        display_name: name,
        joined_at: new Date().toISOString(),
      },
      { onConflict: "session_id,display_name" }
    );
}

async function ensureSessionRow(params: {
  sessionId: string;
  topic: string;
  capacity: number;
}) {
  const { sessionId, topic, capacity } = params;

  // まず既存確認
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("sessions")
    .select("id, topic, capacity, status")
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

  // 無ければ insert を試す
  const { error: insertErr } = await supabaseAdmin.from("sessions").insert({
    id: sessionId,
    topic,
    status: "forming",
    capacity: capacity > 0 ? capacity : 5,
  });

  // 同時実行で既に作られていた場合は成功扱いにする
  if (insertErr) {
    const code = (insertErr as any)?.code ?? "";
    if (code !== "23505") {
      return { ok: false as const, error: insertErr };
    }
  }

  // insert 成功 or 重複でも、必要なら topic/capacity を補正
  const { data: after, error: afterErr } = await supabaseAdmin
    .from("sessions")
    .select("id, topic, capacity, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (afterErr) {
    return { ok: false as const, error: afterErr };
  }

  if (!after) {
    return {
      ok: false as const,
      error: { message: "session_not_found_after_insert" },
    };
  }

  const updates: Record<string, any> = {};

  if ((!after.topic || after.topic === "free") && topic) {
    updates.topic = topic;
  }

  if ((!after.capacity || Number(after.capacity) <= 0) && capacity > 0) {
    updates.capacity = capacity;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const sessionIdRaw = String(body.sessionId ?? "").trim();
    const classIdRaw = String(body.classId ?? "").trim();
    const topic = String(body.topic ?? "").trim();
    const name = String(body.name ?? "").trim();
    const capacity = Number(body.capacity ?? 0);

    // ① Room/Call 用：sessionId で参加
    if (sessionIdRaw) {
      if (!isUuid(sessionIdRaw)) {
        return NextResponse.json(
          { ok: false, error: "sessionId must be uuid" },
          { status: 400 }
        );
      }

      if (!name) {
        return NextResponse.json(
          { ok: false, error: "name required" },
          { status: 400 }
        );
      }

      let resolvedTopic = topic;
      const resolvedCapacity =
        Number.isFinite(capacity) && capacity > 0 ? capacity : 5;

      if (classIdRaw) {
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
      } else {
        resolvedTopic = resolvedTopic || "クラス";
      }

      const ensured = await ensureSessionRow({
        sessionId: sessionIdRaw,
        topic: resolvedTopic,
        capacity: resolvedCapacity,
      });

      if (!ensured.ok) {
        console.error("[session/join] ensure session error:", ensured.error);
        return NextResponse.json(
          { ok: false, error: ensured.error.message ?? "ensure_session_failed" },
          { status: 500 }
        );
      }

      const { error } = await upsertMember(sessionIdRaw, name);
      if (error) {
        console.error("[session/join] member upsert error:", error);
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        sessionId: sessionIdRaw,
        topic: resolvedTopic,
        capacity: resolvedCapacity,
      });
    }

    // ② 既存用途：topic から join_or_create_session（RPC）
    if (!topic || !name || !Number.isFinite(capacity) || capacity <= 0) {
      return new NextResponse("missing or invalid fields", { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("join_or_create_session", {
      p_topic: topic,
      p_name: name,
      p_capacity: capacity,
    });

    if (error) {
      console.error("[session/join] RPC error:", error);
      return new NextResponse(error.message, { status: 500 });
    }

    if (!data || data.length === 0) {
      return new NextResponse("no session returned", { status: 500 });
    }

    const row = data[0] as any;

    const sessionId = String(row.session_id ?? "");
    const status = String(row.status ?? "forming");
    const memberCount = Number(row.member_count ?? 0);
    const cap = Number(row.capacity ?? capacity);

    if (!sessionId) {
      return new NextResponse("session_id missing from rpc result", {
        status: 500,
      });
    }

    {
      const { error: upsertErr } = await upsertMember(sessionId, name);
      if (upsertErr) {
        console.error("[session/join] member upsert error after rpc:", upsertErr);
      }
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
    return new NextResponse(e?.message ?? "server error", { status: 500 });
  }
}