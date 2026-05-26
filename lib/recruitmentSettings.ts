import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES } from "@/lib/recruitment";

const CACHE_MS = 60_000;

let cachedTtl: { value: number; at: number } | null = null;

function normalizeTtlMinutes(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(1440, Math.floor(n)));
}

export function recruitmentSessionTtlFromEnv() {
  return normalizeTtlMinutes(process.env.RECRUITMENT_SESSION_TTL_MINUTES);
}

export async function getRecruitmentSessionTtlMinutes() {
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

  const value = data?.value as { minutes?: unknown } | number | null;
  const rawMinutes =
    typeof value === "number"
      ? value
      : typeof value === "object" && value !== null
        ? value.minutes
        : null;

  const ttl =
    normalizeTtlMinutes(rawMinutes) ?? DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES;

  cachedTtl = { value: ttl, at: Date.now() };
  return ttl;
}
