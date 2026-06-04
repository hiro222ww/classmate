import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  describeVoiceTransportMode,
  normalizeVoiceTransportSettings,
} from "@/lib/voiceTransportMode";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("voice_settings")
    .select("*")
    .eq("id", "global")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings = data ?? {
    voice_enabled: true,
    new_calls_enabled: true,
    p2p_enabled: true,
    turn_fallback_enabled: false,
    max_call_minutes: 30,
    max_members_per_call: 5,
    free_daily_minutes: 30,
    paid_daily_minutes: 120,
    emergency_message: null,
  };

  const transport = normalizeVoiceTransportSettings({
    p2p_enabled: settings.p2p_enabled,
    turn_fallback_enabled: settings.turn_fallback_enabled,
  });

  return NextResponse.json({
    settings,
    voice_enabled: settings.voice_enabled !== false,
    new_calls_enabled: settings.new_calls_enabled !== false,
    p2p_enabled: transport.p2pEnabled,
    static_turn_enabled: transport.staticTurnEnabled,
    turn_fallback_enabled: transport.staticTurnEnabled,
    transport_mode: describeVoiceTransportMode(
      transport.p2pEnabled,
      transport.staticTurnEnabled
    ),
  });
}
