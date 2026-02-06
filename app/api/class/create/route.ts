import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { deviceId, name, description, worldKey, topicKey, minAge, isSensitive, isPremium } = await req.json();
  if (!deviceId || !name) return NextResponse.json({ error: "deviceId & name required" }, { status: 400 });

  const sb = supabaseServer();

  const { data: ent } = await sb.from("user_entitlements").select("*").eq("device_id", deviceId).maybeSingle();
  if (!ent) {
    // entitlementsが無ければ作る（SQL側でもensure_entitlementsあるが念のため）
    await sb.from("user_entitlements").insert({ device_id: deviceId }).select().maybeSingle();
  }

  const { data, error } = await sb.rpc("create_class", {
    p_device_id: deviceId,
    p_name: String(name).slice(0, 60),
    p_description: String(description ?? "").slice(0, 200),
    p_world_key: worldKey ?? "default",
    p_topic_key: topicKey ?? "free_talk",
    p_min_age: Number(minAge ?? 0),
    p_is_sensitive: Boolean(isSensitive),
    p_is_premium: Boolean(isPremium),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ classId: data });
}
