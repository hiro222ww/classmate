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
