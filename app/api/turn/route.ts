import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildStaticTurnIceServers,
  isTwilioTurnEnvPresent,
  logTurnProviderDiagnostics,
  resolveTurnProvider,
  type TurnProvider,
} from "@/lib/turnProvider";

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

async function fetchTwilioIceServers() {
  if (!isTwilioTurnEnvPresent()) {
    console.warn(
      "[turn] api-error provider=twilio branch=twilio_env_missing"
    );
    return NextResponse.json(
      { ok: false, error: "twilio_env_missing" },
      { status: 500 }
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

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
    console.warn(
      `[turn] api-error provider=twilio branch=twilio_token_failed status=${res.status}`
    );
    return NextResponse.json(
      { ok: false, error: "twilio_token_failed" },
      { status: res.status }
    );
  }

  const iceServers = Array.isArray(data?.ice_servers)
    ? data.ice_servers
    : Array.isArray(data?.iceServers)
      ? data.iceServers
      : [];

  console.log(
    `[turn] api-response provider=twilio iceServersCount=${iceServers.length}`
  );

  return NextResponse.json({
    ...data,
    provider: "twilio" satisfies TurnProvider,
    iceServers,
    ice_servers: iceServers.length > 0 ? iceServers : data?.ice_servers,
  });
}

function staticTurnResponse(provider: TurnProvider) {
  const built = buildStaticTurnIceServers();

  if (!built.ok) {
    console.warn(
      `[turn] api-error status=500 error=static_turn_env_missing missing=${built.missing.join(",")}`
    );
    return NextResponse.json(
      {
        ok: false,
        error: built.error,
        missing: built.missing,
      },
      { status: 500 }
    );
  }

  const iceServers = built.iceServers;

  console.log(
    `[turn] api-response provider=${provider} iceServersCount=${iceServers.length}`
  );

  return NextResponse.json({
    ok: true,
    provider,
    iceServers,
    ice_servers: iceServers,
  });
}

export async function GET() {
  if (!(await isTurnFallbackExplicitlyEnabled())) {
    console.log("[turn] api-error status=403 error=turn_fallback_disabled");
    return NextResponse.json(
      { ok: false, error: "turn_fallback_disabled" },
      { status: 403 }
    );
  }

  const provider = resolveTurnProvider();
  logTurnProviderDiagnostics("api-request");

  if (provider === "disabled") {
    console.log("[turn] api-error status=403 error=turn_disabled");
    return NextResponse.json(
      { ok: false, error: "turn_disabled" },
      { status: 403 }
    );
  }

  if (provider === "static") {
    return staticTurnResponse(provider);
  }

  if (provider === "twilio") {
    return fetchTwilioIceServers();
  }

  console.log("[turn] api-error status=403 error=turn_disabled");
  return NextResponse.json(
    { ok: false, error: "turn_disabled" },
    { status: 403 }
  );
}
