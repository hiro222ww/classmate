import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { deviceId } = await req.json();
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  const sb = supabaseServer();

  // プロフィール存在チェック（あなたの既存仕様と整合）
  const prof = await sb.from("user_profiles").select("device_id").eq("device_id", deviceId).maybeSingle();
  if (!prof.data) return NextResponse.json({ error: "profile_not_found" }, { status: 403 });

  const { data, error } = await sb.rpc("get_or_assign_active_class", { p_device_id: deviceId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ activeClass: data?.[0] ?? null });
}
