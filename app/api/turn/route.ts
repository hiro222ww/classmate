import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function isTurnFallbackExplicitlyEnabled() {
  const { data, error } = await supabaseAdmin
    .from("voice_settings")
    .select("turn_fallback_enabled")
    .eq("id", "global")
    .maybeSingle();

  if (error) {
    console.warn("[turn] voice_settings lookup failed", error.message);
    return false;
  }

  return data?.turn_fallback_enabled === true;
}

export async function GET() {
  if (!(await isTurnFallbackExplicitlyEnabled())) {
    return NextResponse.json(
      { ok: false, error: "turn_fallback_disabled" },
      { status: 403 }
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  if (!accountSid || !apiKey || !apiSecret) {
    return NextResponse.json(
      { ok: false, error: "twilio_env_missing" },
      { status: 500 }
    );
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      Ttl: "3600",
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: "twilio_token_failed", detail: data },
      { status: res.status }
    );
  }

  return NextResponse.json(data);
}
