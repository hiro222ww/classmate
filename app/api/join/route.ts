import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

function randomUuid(): string {
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  return await supabaseAdmin
    .from("session_members")
    .upsert(
      {
        session_id: sessionId,
        device_id: deviceId,
        display_name: name,
        joined_at: new Date().toISOString(),
      },
      { onConflict: "session_id,device_id" }
    );
}

async function findOrCreateSessionForClass(params: {
  classId: string;
  topic: string;
  capacity: number;
}) {
  const { classId, topic, capacity } = params;

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("sessions")
    .select("id, class_id, topic, status, capacity, created_at")
    .eq("class_id", classId)
    .in("status", ["forming", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
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
        .eq("id", existing.id);

      if (updateErr) {
        return { ok: false as const, error: updateErr };
      }
    }

    return {
      ok: true as const,
      sessionId: String(existing.id),
      status: String(existing.status || "forming"),
      capacity: Number(existing.capacity || capacity || 5),
    };
  }

  const sessionId = randomUuid();

  const { error: insertErr } = await supabaseAdmin.from("sessions").insert({
    id: sessionId,
    class_id: classId,
    topic,
    status: "forming",
    capacity: capacity > 0 ? capacity : 5,
  });

  if (insertErr) {
    return { ok: false as const, error: insertErr };
  }

  return {
    ok: true as const,
    sessionId,
    status: "forming",
    capacity: capacity > 0 ? capacity : 5,
  };
}

async function ensureSessionById(params: {
  sessionId: string;
  classId?: string;
  topic: string;
  capacity: number;
}) {
  const { sessionId, classId, topic, capacity } = params;

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("sessions")
    .select("id, class_id, topic, status, capacity")
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

    return {
      ok: true as const,
      sessionId,
      status: String(existing.status || "forming"),
      capacity: Number(existing.capacity || capacity || 5),
    };
  }

  const { error: insertErr } = await supabaseAdmin.from("sessions").insert({
    id: sessionId,
    class_id: classId || null,
    topic,
    status: "forming",
    capacity: capacity > 0 ? capacity : 5,
  });

  if (insertErr) {
    return { ok: false as const, error: insertErr };
  }

  return {
    ok: true as const,
    sessionId,
    status: "forming",
    capacity: capacity > 0 ? capacity : 5,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const sessionIdRaw = String(body.sessionId ?? "").trim();
    const classIdRaw = String(body.classId ?? "").trim();
    const topicRaw = String(body.topic ?? "").trim();
    const name = String(body.name ?? "").trim();
    const deviceId = String(body.deviceId ?? "").trim();
    const capacityRaw = Number(body.capacity ?? 5);

    const capacity = Number.isFinite(capacityRaw) && capacityRaw > 0 ? capacityRaw : 5;

    if (!name) {
      return new NextResponse("name required", { status: 400 });
    }

    if (!deviceId) {
      return new NextResponse("deviceId required", { status: 400 });
    }

    let resolvedTopic = topicRaw || "クラス";

    if (classIdRaw) {
      const { data: cls, error: clsErr } = await supabaseAdmin
        .from("classes")
        .select("id, name, topic_key, world_key")
        .eq("id", classIdRaw)
        .maybeSingle();

      if (clsErr) {
        return new NextResponse(clsErr.message, { status: 500 });
      }

      if (cls) {
        resolvedTopic = buildTopicLabelFromClass(cls);
      }
    }

    let resolved:
      | {
          ok: true;
          sessionId: string;
          status: string;
          capacity: number;
        }
      | {
          ok: false;
          error: any;
        };

    // classId があるときは class 単位で共有セッションを使う
    if (classIdRaw) {
      resolved = await findOrCreateSessionForClass({
        classId: classIdRaw,
        topic: resolvedTopic,
        capacity,
      });
    } else {
      if (!sessionIdRaw) {
        return new NextResponse("sessionId or classId required", { status: 400 });
      }

      if (!isUuid(sessionIdRaw)) {
        return new NextResponse("sessionId must be uuid", { status: 400 });
      }

      resolved = await ensureSessionById({
        sessionId: sessionIdRaw,
        classId: classIdRaw || undefined,
        topic: resolvedTopic,
        capacity,
      });
    }

    if (!resolved.ok) {
      return new NextResponse(resolved.error?.message ?? "session_resolve_failed", {
        status: 500,
      });
    }

    const memberResult = await upsertMember(resolved.sessionId, deviceId, name);

    if (memberResult.error) {
      return new NextResponse(memberResult.error.message, { status: 500 });
    }

    const { count, error: countErr } = await supabaseAdmin
      .from("session_members")
      .select("*", { count: "exact", head: true })
      .eq("session_id", resolved.sessionId);

    if (countErr) {
      return new NextResponse(countErr.message, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      sessionId: resolved.sessionId,
      status: resolved.status,
      capacity: resolved.capacity,
      memberCount: Number(count ?? 0),
      topic: resolvedTopic,
    });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "server error", { status: 500 });
  }
}