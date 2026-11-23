import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseBillingFlag } from "@/lib/billingAvailability";
import { EXPERIENCE_FEATURE_SETTING_KEY } from "@/lib/experience/types";

export async function isExperienceFeatureEnabled(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", EXPERIENCE_FEATURE_SETTING_KEY)
    .maybeSingle();
  if (error) return false;
  return parseBillingFlag(data?.value, false);
}

export async function setExperienceFeatureEnabled(
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    {
      key: EXPERIENCE_FEATURE_SETTING_KEY,
      value: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
