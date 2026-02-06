import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";


export async function POST(req: Request) {
  try {
    const body = await req.json();

    const topic = String(body.topic ?? "");
    const name = String(body.name ?? "");
    const capacity = Number(body.capacity ?? 0);

    if (!topic || !name || !Number.isFinite(capacity) || capacity <= 0) {
      return new NextResponse("missing or invalid fields", { status: 400 });
    }

    // RPC 呼び出し
    const { data, error } = await supabaseAdmin.rpc(
      "join_or_create_session",
      {
        p_topic: topic,
        p_name: name,
        p_capacity: capacity,
      }
    );

    if (error) {
      console.error("RPC error:", error);
      return new NextResponse(error.message, { status: 500 });
    }

    if (!data || data.length === 0) {
      return new NextResponse("no session returned", { status: 500 });
    }

    const row = data[0] as any;

    // ★ ここで camelCase に正規化して返す
    const sessionId = String(row.session_id ?? "");
    const status = String(row.status ?? "forming");
    const memberCount = Number(row.member_count ?? 0);
    const cap = Number(row.capacity ?? capacity);

    if (!sessionId) {
      return new NextResponse("session_id missing from rpc result", {
        status: 500,
      });
    }

    return NextResponse.json({
      sessionId,
      status,
      memberCount,
      capacity: cap,
    });
  } catch (e: any) {
    console.error("session join error:", e);
    return new NextResponse(e?.message ?? "server error", { status: 500 });
  }
}
