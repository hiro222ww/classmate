import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export async function POST(req: Request) {
  const { deviceId, title, description, minAge, isSensitive, isPremium } = await req.json();
  if (!deviceId || !title) return NextResponse.json({ error: "deviceId & title required" }, { status: 400 });

  const sb = supabaseServer();
  const key = `u_${slugify(title)}_${Math.floor(Date.now() / 1000)}`;

  const { error } = await sb.rpc("create_topic", {
    p_device_id: deviceId,
    p_topic_key: key,
    p_title: String(title).slice(0, 40),
    p_description: String(description ?? "").slice(0, 200),
    p_min_age: Number(minAge ?? 0),
    p_is_sensitive: Boolean(isSensitive),
    p_is_premium: Boolean(isPremium),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topicKey: key });
}
