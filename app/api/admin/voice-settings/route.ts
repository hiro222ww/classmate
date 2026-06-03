import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { getTurnProviderInfo } from "@/lib/turnProvider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = "global";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from("voice_settings")
    .select("*")
    .eq("id", ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }

  const turnProvider = getTurnProviderInfo();

  return NextResponse.json({
    ok: true,
    settings: data,
    turn_provider: turnProvider.provider,
    turn_provider_enabled: turnProvider.enabled,
  });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const payload = {
    id: ID,

    // 通話全体ON/OFF
    voice_enabled: Boolean(body.voice_enabled),

    // 新規通話受付
    new_calls_enabled: Boolean(body.new_calls_enabled),

    // TURN fallback
    turn_fallback_enabled: Boolean(
      body.turn_fallback_enabled
    ),

    // 最大人数
    max_members_per_call: Number(
      body.max_members_per_call ?? 5
    ),

    // 緊急メッセージ
    emergency_message:
      body.emergency_message || null,

    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("voice_settings")
    .upsert(payload, {
      onConflict: "id",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    settings: data,
  });
}