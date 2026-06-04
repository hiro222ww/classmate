import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import {
  describeVoiceTransportMode,
  normalizeVoiceTransportSettings,
} from "@/lib/voiceTransportMode";

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

  const transport = normalizeVoiceTransportSettings({
    p2p_enabled: data?.p2p_enabled,
    turn_fallback_enabled: data?.turn_fallback_enabled,
  });

  return NextResponse.json({
    ok: true,
    settings: data,
    transport_mode: describeVoiceTransportMode(
      transport.p2pEnabled,
      transport.staticTurnEnabled
    ),
  });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const payload = {
    id: ID,
    voice_enabled: Boolean(body.voice_enabled),
    new_calls_enabled: Boolean(body.new_calls_enabled),
    p2p_enabled: body.p2p_enabled !== false,
    turn_fallback_enabled: Boolean(body.turn_fallback_enabled),
    max_members_per_call: Number(body.max_members_per_call ?? 5),
    emergency_message: body.emergency_message || null,
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

  const transport = normalizeVoiceTransportSettings({
    p2p_enabled: data.p2p_enabled,
    turn_fallback_enabled: data.turn_fallback_enabled,
  });

  return NextResponse.json({
    ok: true,
    settings: data,
    transport_mode: describeVoiceTransportMode(
      transport.p2pEnabled,
      transport.staticTurnEnabled
    ),
  });
}
