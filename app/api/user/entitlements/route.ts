import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { deviceId } = await req.json();
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  const sb = supabaseServer();

  // プロフィール必須（既存仕様）
  const prof = await sb.from("user_profiles").select("device_id").eq("device_id", deviceId).maybeSingle();
  if (!prof.data) return NextResponse.json({ error: "profile_not_found" }, { status: 403 });

  // entitlements 取得（なければ作成）
  const { data: ent0 } = await sb.from("user_entitlements").select("*").eq("device_id", deviceId).maybeSingle();
  if (!ent0) {
    await sb.from("user_entitlements").insert({ device_id: deviceId }).select().maybeSingle();
  }
  const { data: ent } = await sb.from("user_entitlements").select("*").eq("device_id", deviceId).maybeSingle();

  const plan = ent?.plan ?? "free";
  const isPremium = plan !== "free";

  return NextResponse.json({ plan, isPremium, entitlements: ent ?? null });
}
