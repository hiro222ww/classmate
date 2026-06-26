import {
  getAgeFilterBounds,
  MATCH_PREFS_SLIDER_MAX,
  MATCH_PREFS_SLIDER_MIN,
} from "@/lib/agePolicyRules";

export type MatchPrefs = {
  min_age: number;
  max_age: number;
};

export const AGE_FILTER_OFF_MIN = 0;
export const AGE_FILTER_OFF_MAX = 130;

export const AGE_FILTER_OFF_PREFS: MatchPrefs = {
  min_age: AGE_FILTER_OFF_MIN,
  max_age: AGE_FILTER_OFF_MAX,
};

export const AGE_FILTER_ON_DEFAULT: MatchPrefs = { min_age: 18, max_age: 25 };

export const AGE_FILTER_SLIDER_MIN = MATCH_PREFS_SLIDER_MIN;
export const AGE_FILTER_SLIDER_MAX = MATCH_PREFS_SLIDER_MAX;

export function resolveAgeFilterSliderBounds() {
  const bounds = getAgeFilterBounds();
  return {
    sliderMin: bounds.sliderMin,
    sliderMax: bounds.sliderMax,
  };
}

export function resolveAgeFilterOnDefault(): MatchPrefs {
  const bounds = getAgeFilterBounds();
  return { min_age: bounds.defaultMin, max_age: bounds.defaultMax };
}

export function sanitizeActiveMatchPrefs(prefs: MatchPrefs): MatchPrefs {
  if (isAgeFilterOff(prefs)) return AGE_FILTER_OFF_PREFS;

  if (prefs.max_age >= AGE_FILTER_OFF_MAX) {
    return resolveAgeFilterOnDefault();
  }

  return normalizeMatchPrefs({
    min_age: clampAge(prefs.min_age, AGE_FILTER_SLIDER_MIN, AGE_FILTER_SLIDER_MAX),
    max_age: clampAge(prefs.max_age, AGE_FILTER_SLIDER_MIN, AGE_FILTER_SLIDER_MAX),
  });
}

export const AGE_PREF_HELP_TEXT =
  "OFFのときは年齢では絞り込みません。ONにすると、指定した年齢条件に合うクラスを探します。ONにするにはプロフィール登録が必要です。";

export function clampAge(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function isAgeFilterOff(prefs: MatchPrefs) {
  return (
    prefs.min_age === AGE_FILTER_OFF_MIN && prefs.max_age === AGE_FILTER_OFF_MAX
  );
}

export function normalizeMatchPrefs(prefs: MatchPrefs): MatchPrefs {
  return {
    min_age: Math.min(prefs.min_age, prefs.max_age),
    max_age: Math.max(prefs.min_age, prefs.max_age),
  };
}

export function matchPrefsForSubmit(prefs: MatchPrefs): MatchPrefs {
  if (isAgeFilterOff(prefs)) return AGE_FILTER_OFF_PREFS;
  return normalizeMatchPrefs(prefs);
}
