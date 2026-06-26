/** Pure age-policy rules — safe to import from Client Components (no Supabase). */

/** 18歳未満 / 高校生以下を対象外とする本番初期モード */
export const ADULT_AGE_THRESHOLD = 18;

/** ON 時の年齢スライダー上限（OFF 時の 130 とは別） */
export const MATCH_PREFS_SLIDER_MAX = 60;

export type AgeMode =
  | "post_high_school_only"
  | "minor_separated_test"
  | "open_16_plus";

const AGE_MODE_VALUES = new Set<AgeMode>([
  "post_high_school_only",
  "minor_separated_test",
  "open_16_plus",
]);

export function isMinorsExperimentAllowedEnv(): boolean {
  return process.env.ALLOW_MINORS_EXPERIMENT === "true";
}

/** 本番での管理画面からの未成年設定変更をブロック（読み取りは DB を尊重） */
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

export function parseMinorsEnabledValue(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0" || normalized === "") {
      return false;
    }
    try {
      return parseMinorsEnabledValue(JSON.parse(value));
    } catch {
      return false;
    }
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.enabled === true) return true;
    if (obj.minors_enabled === true) return true;
    if ("value" in obj) {
      return parseMinorsEnabledValue(obj.value);
    }
  }

  return false;
}

export function resolveMinorsEnabledFromSettings(
  settingsJson: unknown
): boolean {
  if (!settingsJson || typeof settingsJson !== "object") return false;
  const row = settingsJson as Record<string, unknown>;
  if (parseMinorsEnabledValue(row.minors_enabled)) return true;
  const nested = row.settings;
  if (nested && typeof nested === "object") {
    return parseMinorsEnabledValue(
      (nested as Record<string, unknown>).minors_enabled
    );
  }
  return false;
}

export function ageModeFromLegacyMinors(minorsEnabled: boolean): AgeMode {
  return minorsEnabled ? "minor_separated_test" : "post_high_school_only";
}

export function resolveAgeModeFromSettings(settingsJson: unknown): AgeMode {
  if (!settingsJson || typeof settingsJson !== "object") {
    return "post_high_school_only";
  }
  const row = settingsJson as Record<string, unknown>;
  const direct = parseAgeModeValue(row.age_mode);
  if (direct) return direct;
  return ageModeFromLegacyMinors(resolveMinorsEnabledFromSettings(settingsJson));
}

export function adultOnlyUserMessage() {
  return "現在このサービスは18歳以上のみ利用できます。";
}

export function guardianConsentRequiredMessage() {
  return "18歳未満の方は保護者の同意が必要です。";
}

export type AgeFilterBounds = {
  sliderMin: number;
  sliderMax: number;
  defaultMin: number;
  defaultMax: number;
};

/** UI/API shared bounds for match-prefs age sliders. */
export function getAgeFilterBounds(
  mode: AgeMode,
  selfAge: number | null
): AgeFilterBounds {
  const sliderMax = MATCH_PREFS_SLIDER_MAX;

  if (mode === "post_high_school_only") {
    return {
      sliderMin: ADULT_AGE_THRESHOLD,
      sliderMax,
      defaultMin: ADULT_AGE_THRESHOLD,
      defaultMax: 25,
    };
  }

  if (mode === "open_16_plus") {
    return {
      sliderMin: 16,
      sliderMax,
      defaultMin: 16,
      defaultMax: 25,
    };
  }

  if (selfAge !== null && selfAge < ADULT_AGE_THRESHOLD) {
    return {
      sliderMin: 13,
      sliderMax: ADULT_AGE_THRESHOLD - 1,
      defaultMin: 15,
      defaultMax: ADULT_AGE_THRESHOLD - 1,
    };
  }

  return {
    sliderMin: ADULT_AGE_THRESHOLD,
    sliderMax,
    defaultMin: ADULT_AGE_THRESHOLD,
    defaultMax: 25,
  };
}

export function getDefaultMatchPrefsForMode(
  mode: AgeMode,
  selfAge: number | null
): { min_age: number; max_age: number } {
  const bounds = getAgeFilterBounds(mode, selfAge);
  return { min_age: bounds.defaultMin, max_age: bounds.defaultMax };
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
  if (age === null || !Number.isFinite(age)) {
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

export function checkProfileRegistrationAge(params: {
  age: number;
  mode: AgeMode;
  guardianConsent?: boolean;
}): AgePolicyResult {
  const joinCheck = checkSelfAgeForJoin(params.age, params.mode);
  if (!joinCheck.ok) {
    return joinCheck;
  }

  if (
    params.age < ADULT_AGE_THRESHOLD &&
    params.mode !== "post_high_school_only" &&
    !params.guardianConsent
  ) {
    return {
      ok: false,
      error: "guardian_consent_required",
      message: guardianConsentRequiredMessage(),
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
  } else if (
    mode === "minor_separated_test" &&
    selfAge !== null &&
    selfAge !== undefined
  ) {
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
    if (selfAge === null || !Number.isFinite(selfAge)) {
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

  if (
    params.mode === "post_high_school_only" &&
    minAge > 0 &&
    minAge < ADULT_AGE_THRESHOLD
  ) {
    return {
      ok: false,
      error: "sensitive_topic_adult_only",
      message: adultOnlyUserMessage(),
    };
  }

  return { ok: true };
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

export function normalizePrefsAge(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
