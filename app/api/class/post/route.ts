import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { deviceId, classId, message } = await req.json();
  if (!deviceId || !classId || !message) {
    return NextResponse.json({ error: "deviceId, classId, message required" }, { status: 400 });
  }

  const sb = supabaseServer();

  const prof = await sb.from("user_profiles").select("device_id").eq("device_id", deviceId).maybeSingle();
  if (!prof.data) return NextResponse.json({ error: "profile_not_found" }, { status: 403 });

  const trimmed = String(message).trim();
  if (!trimmed) return NextResponse.json({ ok: true });

  const { error } = await sb.rpc("post_class_message", {
    p_device_id: deviceId,
    p_class_id: classId,
    p_message: trimmed,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
