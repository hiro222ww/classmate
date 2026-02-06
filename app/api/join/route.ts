import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";



export async function POST(req: Request) {
  try {
    const body = await req.json();

    const topic = String(body.topic ?? "");
    const name = String(body.name ?? "");
    const capacity = Number(body.capacity ?? 0);

    if (!topic || !name || !Number.isFinite(capacity) || capacity <= 0) {
      return new NextResponse("missing fields", { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("join_or_create_session", {
      p_topic: topic,
      p_name: name,
      p_capacity: capacity,
    });

    if (error) {
      return new NextResponse(error.message, { status: 500 });
    }
    if (!data || data.length === 0) {
      return new NextResponse("no session returned", { status: 500 });
    }

    // RPCの戻り（snake_case）を “必ず camelCase” に整形して返す
    const row = data[0] as any;

    const sessionId = String(row.session_id ?? "");
    const status = String(row.status ?? "forming");
    const cap = Number(row.capacity ?? capacity);
    const memberCount = Number(row.member_count ?? 0);

    if (!sessionId) {
      return new NextResponse("session_id missing from rpc result", { status: 500 });
    }

    return NextResponse.json({
      sessionId,
      status,
      capacity: cap,
      memberCount,
    });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "server error", { status: 500 });
  }
}
