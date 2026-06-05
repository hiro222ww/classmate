import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEFAULT_P2P_ENABLED,
  describeVoiceTransportMode,
  normalizeVoiceTransportSettings,
  parseExplicitBoolean,
} from "@/lib/voiceTransportMode";
import { resolveIceTransportPolicy } from "@/lib/voiceRoute";

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

  const rawP2p = data?.p2p_enabled;
  const p2pEnabled = parseExplicitBoolean(rawP2p, DEFAULT_P2P_ENABLED);
  const rawTurn = data?.turn_fallback_enabled;

  const settings = data
    ? {
        ...data,
        p2p_enabled: p2pEnabled,
      }
    : {
        voice_enabled: true,
        new_calls_enabled: true,
        p2p_enabled: p2pEnabled,
        turn_fallback_enabled: false,
        max_call_minutes: 30,
        max_members_per_call: 5,
        free_daily_minutes: 30,
        paid_daily_minutes: 120,
        emergency_message: null,
      };

  const transport = normalizeVoiceTransportSettings({
    p2p_enabled: p2pEnabled,
    turn_fallback_enabled: rawTurn ?? settings.turn_fallback_enabled,
  });

  const icePolicy = resolveIceTransportPolicy(transport.relayForced);

  console.log(
    `[voice-settings] client-loaded p2p_enabled=${p2pEnabled} turn_provider=static icePolicy=${icePolicy} source=${data ? "db" : "default"}`
  );

  return NextResponse.json({
    settings,
    voice_enabled: settings.voice_enabled !== false,
    new_calls_enabled: settings.new_calls_enabled !== false,
    p2p_enabled: p2pEnabled,
    static_turn_enabled: transport.staticTurnEnabled,
    turn_fallback_enabled: transport.staticTurnEnabled,
    transport_mode: describeVoiceTransportMode(
      transport.p2pEnabled,
      transport.staticTurnEnabled
    ),
    ice_transport_policy: icePolicy,
  });
}
