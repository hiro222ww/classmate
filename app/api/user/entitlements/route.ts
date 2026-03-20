// app/api/user/entitlements/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function handle(deviceId: string) {
  if (!deviceId) {
    return NextResponse.json({ error: "device_id_missing" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("user_entitlements")
    .select("device_id, plan, class_slots, can_create_classes, topic_plan, theme_pass, updated_at")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      device_id: deviceId,
      plan: "free",
      class_slots: 1,
      can_create_classes: false,
      topic_plan: 0,
      theme_pass: false,
      updated_at: new Date(0).toISOString(),
    });
  }

  return NextResponse.json(data);
}

// GET: ヘッダから受ける（推奨）
export async function GET(req: Request) {
  const deviceId = req.headers.get("x-device-id") || "";
  return handle(deviceId);
}

// POST: body から受ける（互換）
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const deviceId = body?.deviceId || "";
  return handle(deviceId);
}