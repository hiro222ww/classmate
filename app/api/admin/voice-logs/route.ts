import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);

  const { data, error } = await supabaseAdmin
    .from("voice_connection_logs")
    .select(
      "id, session_id, device_id, os, member_count, route, used_turn, connection_state, time_to_connect_ms, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    logs: data ?? [],
  });
}