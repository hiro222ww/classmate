import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAgeFromBirthDate } from "@/lib/age";
import { parseMinorsEnabledValue } from "@/lib/minorsSettings";

/** 18歳未満 / 高校生以下を対象外とする本番初期モード */
export const ADULT_AGE_THRESHOLD = 18;

export type AgeMode =
  | "post_high_school_only"
  | "minor_separated_test"
  | "open_16_plus";

const AGE_MODE_VALUES = new Set<AgeMode>([
  "post_high_school_only",
  "minor_separated_test",
  "open_16_plus",
]);

const CACHE_MS = 60_000;
let cachedAgePolicy: { mode: AgeMode; at: number } | null = null;

export function isMinorsExperimentAllowedEnv(): boolean {
  return process.env.ALLOW_MINORS_EXPERIMENT === "true";
}

/** 本番では DB 設定に関わらず post_high_school_only を強制 */
export function isProductionAgeLocked(): boolean {
  return (
    process.env.NODE_ENV === "production" && !isMinorsExperimentAllowedEnv()
  );
}

export function parseAgeModeValue(value: unknown): AgeMode | null {
  if (typeof value === "string" && AGE_MODE_VALUES.has(value as AgeMode)) {
    return value as AgeMode;
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const nested = obj.age_mode ?? obj.mode;
    if (typeof nested === "string" && AGE_MODE_VALUES.has(nested as AgeMode)) {
      return nested as AgeMode;
    }
  }

  return null;
}

export function ageModeFromLegacyMinors(minorsEnabled: boolean): AgeMode {
  return minorsEnabled ? "minor_separated_test" : "post_high_school_only";
}

export function clearAgePolicyCache() {
  cachedAgePolicy = null;
}

export async function getEffectiveAgeMode(): Promise<AgeMode> {
  if (isProductionAgeLocked()) {
    return "post_high_school_only";
  }

  if (cachedAgePolicy && Date.now() - cachedAgePolicy.at < CACHE_MS) {
    return cachedAgePolicy.mode;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["age_mode", "minors_enabled"]);

    if (error) {
      cachedAgePolicy = { mode: "post_high_school_only", at: Date.now() };
      return "post_high_school_only";
    }

    let mode: AgeMode | null = null;
    let minorsEnabled = false;

    for (const row of data ?? []) {
      if (row.key === "age_mode") {
        mode = parseAgeModeValue(row.value);
      }
      if (row.key === "minors_enabled") {
        minorsEnabled = parseMinorsEnabledValue(row.value);
      }
    }

    const resolved =
      mode ?? ageModeFromLegacyMinors(minorsEnabled) ?? "post_high_school_only";

    cachedAgePolicy = { mode: resolved, at: Date.now() };
    return resolved;
  } catch {
    cachedAgePolicy = { mode: "post_high_school_only", at: Date.now() };
    return "post_high_school_only";
  }
}

export async function isMinorsRegistrationAllowed(): Promise<boolean> {
  const mode = await getEffectiveAgeMode();
  return mode !== "post_high_school_only";
}

export function adultOnlyUserMessage() {
  return "Classmateは大学生・専門学生・社会人向けのサービスです。高校生以下はご利用いただけません。";
}

export type AgePolicyErrorCode =
  | "profile_age_required"
  | "adult_only"
  | "minors_disabled"
  | "guardian_consent_required"
  | "sensitive_topic_adult_only"
  | "topic_min_age";

export type AgePolicyResult =
  | { ok: true }
  | { ok: false; error: AgePolicyErrorCode; message: string };

export function checkSelfAgeForJoin(
  age: number | null,
  mode: AgeMode
): AgePolicyResult {
  if (age === null) {
    return {
      ok: false,
      error: "profile_age_required",
      message: "プロフィールの生年月日を登録してください。",
    };
  }

  if (mode === "post_high_school_only" && age < ADULT_AGE_THRESHOLD) {
    return {
      ok: false,
      error: "adult_only",
      message: adultOnlyUserMessage(),
    };
  }

  if (mode === "open_16_plus" && age < 16) {
    return {
      ok: false,
      error: "adult_only",
      message: "16歳未満の方はご利用いただけません。",
    };
  }

  return { ok: true };
}

export function applyAgeModeToMatchRange(
  mode: AgeMode,
  minAge: number,
  maxAge: number,
  selfAge?: number | null
): { minAge: number; maxAge: number } {
  let fixedMin = Math.min(minAge, maxAge);
  let fixedMax = Math.max(minAge, maxAge);

  if (mode === "post_high_school_only") {
    fixedMin = Math.max(fixedMin, ADULT_AGE_THRESHOLD);
    fixedMax = Math.max(fixedMax, ADULT_AGE_THRESHOLD);
  } else if (mode === "open_16_plus") {
    fixedMin = Math.max(fixedMin, 16);
    fixedMax = Math.max(fixedMax, 16);
  } else if (mode === "minor_separated_test" && selfAge !== null && selfAge !== undefined) {
    if (selfAge >= ADULT_AGE_THRESHOLD) {
      fixedMin = Math.max(fixedMin, ADULT_AGE_THRESHOLD);
    } else {
      fixedMax = Math.min(fixedMax, ADULT_AGE_THRESHOLD - 1);
      fixedMin = Math.min(fixedMin, fixedMax);
    }
  }

  return { minAge: fixedMin, maxAge: fixedMax };
}

export function checkTopicAgeAccess(params: {
  mode: AgeMode;
  selfAge: number | null;
  isSensitive?: boolean;
  topicMinAge?: number;
}): AgePolicyResult {
  const minAge = Math.max(0, Number(params.topicMinAge ?? 0));
  const selfAge = params.selfAge;

  if (params.isSensitive || minAge >= ADULT_AGE_THRESHOLD) {
    if (selfAge === null) {
      return {
        ok: false,
        error: "profile_age_required",
        message: "プロフィールの生年月日を登録してください。",
      };
    }
    if (selfAge < ADULT_AGE_THRESHOLD) {
      return {
        ok: false,
        error: "sensitive_topic_adult_only",
        message: "このテーマは18歳以上の方のみ利用できます。",
      };
    }
  }

  if (minAge > 0 && selfAge !== null && selfAge < minAge) {
    return {
      ok: false,
      error: "topic_min_age",
      message: `このテーマは${minAge}歳以上の方のみ利用できます。`,
    };
  }

  if (params.mode === "post_high_school_only" && minAge > 0 && minAge < ADULT_AGE_THRESHOLD) {
    // 本番初期はトピック min_age も18未満を許可しない
    return {
      ok: false,
      error: "sensitive_topic_adult_only",
      message: adultOnlyUserMessage(),
    };
  }

  return { ok: true };
}

export async function getProfileAge(deviceId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("birth_date")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error || !data) return null;
  return getAgeFromBirthDate(String(data.birth_date ?? ""));
}

export function canPersistMinorsOrAgeModeChange(params: {
  nextMinorsEnabled: boolean;
  nextAgeMode: AgeMode;
}): { allowed: boolean; reason?: string } {
  if (isProductionAgeLocked()) {
    if (params.nextMinorsEnabled) {
      return {
        allowed: false,
        reason:
          "本番環境では ALLOW_MINORS_EXPERIMENT=true がない限り、未成年許可は保存できません。",
      };
    }
    if (params.nextAgeMode !== "post_high_school_only") {
      return {
        allowed: false,
        reason:
          "本番環境では ALLOW_MINORS_EXPERIMENT=true がない限り、age_mode は post_high_school_only のみです。",
      };
    }
  }
  return { allowed: true };
}
