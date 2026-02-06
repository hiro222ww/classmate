import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { classId, limit = 100 } = await req.json();
  if (!classId) return NextResponse.json({ error: "classId required" }, { status: 400 });

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("class_messages")
    .select("id, class_id, device_id, message, msg_type, created_at")
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 100, 200));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: (data ?? []).reverse() });
}
