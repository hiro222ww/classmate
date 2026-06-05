import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import {
  DEFAULT_P2P_ENABLED,
  describeVoiceTransportMode,
  normalizeVoiceTransportSettings,
  parseExplicitBoolean,
} from "@/lib/voiceTransportMode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = "global";

function logAdminVoiceSettings(
  event: string,
  extra: Record<string, unknown> = {}
) {
  console.log(
    `[admin-voice-settings] ${event}`,
    Object.entries(extra)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ")
  );
}

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

  const p2pEnabled = parseExplicitBoolean(
    data?.p2p_enabled,
    DEFAULT_P2P_ENABLED
  );
  const transport = normalizeVoiceTransportSettings({
    p2p_enabled: p2pEnabled,
    turn_fallback_enabled: data?.turn_fallback_enabled,
  });

  logAdminVoiceSettings("get", {
    p2p_enabled: p2pEnabled,
    source: data ? "db" : "default",
  });

  return NextResponse.json({
    ok: true,
    settings: data
      ? { ...data, p2p_enabled: p2pEnabled }
      : null,
    p2p_enabled: p2pEnabled,
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

  const p2pEnabled = parseExplicitBoolean(
    body.p2p_enabled,
    DEFAULT_P2P_ENABLED
  );

  logAdminVoiceSettings("save-request", { p2p_enabled: p2pEnabled });

  const payload = {
    id: ID,
    voice_enabled: Boolean(body.voice_enabled),
    new_calls_enabled: Boolean(body.new_calls_enabled),
    p2p_enabled: p2pEnabled,
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
    logAdminVoiceSettings("save-error", { error: error.message });
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }

  const savedP2p = parseExplicitBoolean(data.p2p_enabled, DEFAULT_P2P_ENABLED);
  const transport = normalizeVoiceTransportSettings({
    p2p_enabled: savedP2p,
    turn_fallback_enabled: data.turn_fallback_enabled,
  });

  logAdminVoiceSettings("save-response", {
    p2p_enabled: savedP2p,
    source: "db",
  });

  return NextResponse.json({
    ok: true,
    settings: { ...data, p2p_enabled: savedP2p },
    p2p_enabled: savedP2p,
    transport_mode: describeVoiceTransportMode(
      transport.p2pEnabled,
      transport.staticTurnEnabled
    ),
  });
}
