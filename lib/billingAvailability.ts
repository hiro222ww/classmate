import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BillingCategory } from "@/lib/billingCatalog";

export const BILLING_DISABLED_MESSAGE =
  "β期間中のため、現在はこの課金カテゴリの新規購入・プラン変更を停止しています。";

export const SLOT_BILLING_DISABLED_MESSAGE =
  "現在、クラススロット課金は停止中です。";

export const THEME_BILLING_DISABLED_MESSAGE =
  "現在、テーマ課金は停止中です。公開中のテーマは無料で利用できます。";

/** When slot billing is off, do not enforce paid class limits. */
export const SLOT_BILLING_OFF_EFFECTIVE_LIMIT = 999;

export type BillingCategoryFlags = {
  slot_billing_enabled: boolean;
  theme_billing_enabled: boolean;
};

export const DEFAULT_BILLING_CATEGORY_FLAGS: BillingCategoryFlags = {
  slot_billing_enabled: true,
  theme_billing_enabled: false,
};

/**
 * Parse an app_settings boolean flag.
 * When `defaultWhenMissing` is used for absent/malformed values.
 */
export function parseBillingFlag(
  value: unknown,
  defaultWhenMissing: boolean
): boolean {
  if (value === undefined || value === null) return defaultWhenMissing;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  if (typeof value === "object") {
    const enabled = (value as { enabled?: unknown }).enabled;
    if (enabled === true || enabled === "true" || enabled === 1) return true;
    if (enabled === false || enabled === "false" || enabled === 0) return false;
  }
  return defaultWhenMissing;
}

/** @deprecated Prefer parseBillingFlag with an explicit default. */
export function parseBillingEnabled(value: unknown): boolean {
  return parseBillingFlag(value, false);
}

export function parseSlotBillingEnabled(value: unknown): boolean {
  return parseBillingFlag(
    value,
    DEFAULT_BILLING_CATEGORY_FLAGS.slot_billing_enabled
  );
}

export function parseThemeBillingEnabled(value: unknown): boolean {
  return parseBillingFlag(
    value,
    DEFAULT_BILLING_CATEGORY_FLAGS.theme_billing_enabled
  );
}

async function readSettingValue(key: string): Promise<unknown> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`[billing-availability] lookup failed key=${key}`, error.message);
    return null;
  }

  return data?.value ?? null;
}

export async function getBillingCategoryFlags(): Promise<BillingCategoryFlags> {
  const [slotRaw, themeRaw, legacyRaw] = await Promise.all([
    readSettingValue("slot_billing_enabled"),
    readSettingValue("theme_billing_enabled"),
    readSettingValue("billing_enabled"),
  ]);

  // Prefer explicit category keys. If neither category key exists yet but
  // legacy billing_enabled does, map legacy ON → both ON, OFF → both OFF
  // only when category keys are completely absent.
  const hasSlotKey = slotRaw != null;
  const hasThemeKey = themeRaw != null;

  if (!hasSlotKey && !hasThemeKey && legacyRaw != null) {
    const legacyOn = parseBillingFlag(legacyRaw, false);
    return {
      slot_billing_enabled: legacyOn,
      theme_billing_enabled: legacyOn,
    };
  }

  return {
    slot_billing_enabled: parseSlotBillingEnabled(slotRaw),
    theme_billing_enabled: parseThemeBillingEnabled(themeRaw),
  };
}

export async function isSlotBillingEnabled(): Promise<boolean> {
  const flags = await getBillingCategoryFlags();
  return flags.slot_billing_enabled;
}

export async function isThemeBillingEnabled(): Promise<boolean> {
  const flags = await getBillingCategoryFlags();
  return flags.theme_billing_enabled;
}

/** True if at least one sellable category is enabled (legacy helpers). */
export async function isBillingEnabled(): Promise<boolean> {
  const flags = await getBillingCategoryFlags();
  return flags.slot_billing_enabled || flags.theme_billing_enabled;
}

export function isCategoryBillingEnabled(
  flags: BillingCategoryFlags,
  category: BillingCategory
): boolean {
  return category === "slots"
    ? flags.slot_billing_enabled
    : flags.theme_billing_enabled;
}

export function categoryBillingDisabledMessage(
  category: BillingCategory
): string {
  return category === "slots"
    ? SLOT_BILLING_DISABLED_MESSAGE
    : THEME_BILLING_DISABLED_MESSAGE;
}

export async function assertCategoryBillingEnabled(
  category: BillingCategory
): Promise<{ ok: true } | { ok: false; error: string; message: string }> {
  const flags = await getBillingCategoryFlags();
  if (isCategoryBillingEnabled(flags, category)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: "billing_disabled",
    message: categoryBillingDisabledMessage(category),
  };
}
