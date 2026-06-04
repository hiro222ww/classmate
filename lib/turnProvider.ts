export type TurnProvider = "disabled" | "twilio" | "static";

export type TurnIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const VALID_PROVIDERS: TurnProvider[] = ["disabled", "twilio", "static"];

export function resolveTurnProvider(): TurnProvider {
  const raw = String(process.env.TURN_PROVIDER ?? "disabled")
    .trim()
    .toLowerCase();

  if (VALID_PROVIDERS.includes(raw as TurnProvider)) {
    return raw as TurnProvider;
  }

  return "disabled";
}

export function isTurnProviderEnabled(provider: TurnProvider): boolean {
  return provider !== "disabled";
}

export function logTurnProviderConfig(provider: TurnProvider) {
  const enabled = isTurnProviderEnabled(provider);
  console.log(`[turn] provider=${provider} enabled=${enabled}`);
}

export function parseStaticTurnUrls(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type StaticTurnConfigResult =
  | { ok: true; iceServers: TurnIceServer[] }
  | { ok: false; error: string; missing: string[] };

export function buildStaticTurnIceServers(): StaticTurnConfigResult {
  const urlsRaw = String(process.env.STATIC_TURN_URLS ?? "").trim();
  const username = String(process.env.STATIC_TURN_USERNAME ?? "").trim();
  const credential = String(process.env.STATIC_TURN_CREDENTIAL ?? "").trim();

  const urls = parseStaticTurnUrls(urlsRaw);
  const missing: string[] = [];

  if (urls.length === 0) missing.push("STATIC_TURN_URLS");
  if (!username) missing.push("STATIC_TURN_USERNAME");
  if (!credential) missing.push("STATIC_TURN_CREDENTIAL");

  console.log(
    `[turn] static-config urlsCount=${urls.length} ` +
      `usernamePresent=${Boolean(username)} credentialPresent=${Boolean(credential)}`
  );

  if (missing.length > 0) {
    return { ok: false, error: "static_turn_env_missing", missing };
  }

  return {
    ok: true,
    iceServers: [
      {
        urls,
        username,
        credential,
      },
    ],
  };
}

export function getTurnProviderInfo() {
  const provider = resolveTurnProvider();
  return {
    provider,
    enabled: isTurnProviderEnabled(provider),
  };
}

export function isTwilioTurnEnvPresent() {
  return Boolean(
    String(process.env.TWILIO_ACCOUNT_SID ?? "").trim() &&
      String(process.env.TWILIO_API_KEY ?? "").trim() &&
      String(process.env.TWILIO_API_SECRET ?? "").trim()
  );
}

export type TurnProviderDiagnostics = {
  provider: TurnProvider;
  enabled: boolean;
  twilioEnvPresent: boolean;
  staticEnvConfigured: boolean;
  staticEnvMissing: string[];
  twilioEnvUnusedWarning: boolean;
  twilioEnvRequiredButMissing: boolean;
};

export function getTurnProviderDiagnostics(): TurnProviderDiagnostics {
  const provider = resolveTurnProvider();
  const twilioEnvPresent = isTwilioTurnEnvPresent();
  const staticBuilt = buildStaticTurnIceServers();

  return {
    provider,
    enabled: isTurnProviderEnabled(provider),
    twilioEnvPresent,
    staticEnvConfigured: staticBuilt.ok,
    staticEnvMissing: staticBuilt.ok ? [] : staticBuilt.missing,
    twilioEnvUnusedWarning: provider === "static" && twilioEnvPresent,
    twilioEnvRequiredButMissing: provider === "twilio" && !twilioEnvPresent,
  };
}

/** Server logs only — never prints credentials. */
export function logTurnProviderDiagnostics(context: string) {
  const d = getTurnProviderDiagnostics();
  console.log(
    `[turn] ${context} provider=${d.provider} enabled=${d.enabled} ` +
      `twilioEnvPresent=${d.twilioEnvPresent} staticEnvConfigured=${d.staticEnvConfigured}`
  );

  if (d.twilioEnvUnusedWarning) {
    console.warn(
      `[turn] ${context} twilio-env-present-but-unused provider=static ` +
        "(Twilio API is not called while TURN_PROVIDER=static)"
    );
  }

  if (d.twilioEnvRequiredButMissing) {
    console.warn(
      `[turn] ${context} twilio-env-missing provider=twilio ` +
        "(TWILIO_ACCOUNT_SID / TWILIO_API_KEY / TWILIO_API_SECRET required)"
    );
  }

  if (d.provider === "static" && !d.staticEnvConfigured) {
    console.warn(
      `[turn] ${context} static-env-incomplete missing=${d.staticEnvMissing.join(",")}`
    );
  }
}
