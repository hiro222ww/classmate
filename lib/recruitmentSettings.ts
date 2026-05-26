import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES } from "@/lib/recruitment";

const CACHE_MS = 60_000;

export type RecruitmentSessionTtlSetting = {
  minutes: number | null;
  unlimited: boolean;
};

let cachedTtl: { value: RecruitmentSessionTtlSetting; at: number } | null =
  null;

function normalizeTtlMinutes(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(1440, Math.floor(n)));
}

export function parseRecruitmentSessionTtlValue(
  value: unknown
): RecruitmentSessionTtlSetting {
  if (typeof value === "number") {
    return {
      minutes:
        normalizeTtlMinutes(value) ?? DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES,
      unlimited: false,
    };
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (obj.unlimited === true) {
      return { minutes: null, unlimited: true };
    }

    const minutes = normalizeTtlMinutes(obj.minutes);
    return {
      minutes: minutes ?? DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES,
      unlimited: false,
    };
  }

  return {
    minutes: DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES,
    unlimited: false,
  };
}

export function recruitmentSessionTtlFromEnv(): RecruitmentSessionTtlSetting | null {
  const raw = process.env.RECRUITMENT_SESSION_TTL_MINUTES;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return null;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "unlimited" || normalized === "none" || normalized === "0") {
    return { minutes: null, unlimited: true };
  }

  return parseRecruitmentSessionTtlValue(Number(raw));
}

export function clearRecruitmentSessionTtlCache() {
  cachedTtl = null;
}

export async function getRecruitmentSessionTtlSetting(): Promise<RecruitmentSessionTtlSetting> {
  const fromEnv = recruitmentSessionTtlFromEnv();
  if (fromEnv) return fromEnv;

  if (cachedTtl && Date.now() - cachedTtl.at < CACHE_MS) {
    return cachedTtl.value;
  }

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "recruitment_session_ttl_minutes")
    .maybeSingle();

  const value = parseRecruitmentSessionTtlValue(data?.value ?? null);
  cachedTtl = { value, at: Date.now() };
  return value;
}

/** null = unlimited (no TTL expiry) */
export async function getRecruitmentSessionTtlMinutes(): Promise<number | null> {
  const setting = await getRecruitmentSessionTtlSetting();
  if (setting.unlimited) return null;
  return setting.minutes ?? DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES;
}
