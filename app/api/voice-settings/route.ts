import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  return NextResponse.json({
    settings: data ?? {
      voice_enabled: true,
      new_calls_enabled: true,
      turn_fallback_enabled: true,
      max_call_minutes: 30,
      max_members_per_call: 5,
      free_daily_minutes: 30,
      paid_daily_minutes: 120,
      emergency_message: null,
    },
  });
}