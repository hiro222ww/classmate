// app/api/session/join/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

async function upsertMember(sessionId: string, name: string) {
  // display_name をキーにしてるけど、理想は device_id も持たせて一意制約にする（後で改善可）
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const sessionIdRaw = String(body.sessionId ?? "").trim();
    const topic = String(body.topic ?? "").trim();
    const name = String(body.name ?? "").trim();
    const capacity = Number(body.capacity ?? 0);

    // --- ① Room/Call 用：sessionId で参加記録だけする ---
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

      const { error } = await upsertMember(sessionIdRaw, name);
      if (error) {
        console.error("member upsert error:", error);
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, sessionId: sessionIdRaw });
    }

    // --- ② 既存用途：topic から join_or_create_session（RPC） ---
    if (!topic || !name || !Number.isFinite(capacity) || capacity <= 0) {
      return new NextResponse("missing or invalid fields", { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("join_or_create_session", {
      p_topic: topic,
      p_name: name,
      p_capacity: capacity,
    });

    if (error) {
      console.error("RPC error:", error);
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

    // ✅ RPCで返ったsessionIdでも、念のため session_members に参加記録を残す
    {
      const { error: upsertErr } = await upsertMember(sessionId, name);
      if (upsertErr) {
        console.error("member upsert error after rpc:", upsertErr);
        // 参加記録失敗でもセッション作成自体は成功してるので、致命にしない
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      status,
      memberCount, // RPC由来（status API側で再計算してもOK）
      capacity: cap,
    });
  } catch (e: any) {
    console.error("session join error:", e);
    return new NextResponse(e?.message ?? "server error", { status: 500 });
  }
}
