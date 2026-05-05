import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ID = "global";

function checkAdmin(req: Request) {
  const auth = req.headers.get("authorization");
  const password = process.env.ADMIN_PASSWORD;

  if (!password) return false;
  if (!auth) return false;

  return auth === `Bearer ${password}`;
}

export async function GET(req: Request) {
  // GETは誰でもOK（読むだけ）
  const { data, error } = await supabaseAdmin
    .from("voice_settings")
    .select("*")
    .eq("id", ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

export async function POST(req: Request) {
  // 🔐 管理者チェック
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const payload = {
    id: ID,
    voice_enabled: Boolean(body.voice_enabled),
    new_calls_enabled: Boolean(body.new_calls_enabled),
    turn_fallback_enabled: Boolean(body.turn_fallback_enabled),
    max_call_minutes: Number(body.max_call_minutes ?? 30),
    max_members_per_call: Number(body.max_members_per_call ?? 5),
    free_daily_minutes: Number(body.free_daily_minutes ?? 30),
    paid_daily_minutes: Number(body.paid_daily_minutes ?? 120),
    emergency_message: body.emergency_message || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("voice_settings")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}