import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseBillingFlag } from "@/lib/billingAvailability";
import {
  isBufferCredentialsPresent,
} from "@/lib/marketing/bufferConfig";
import { isMarketingBufferPublishForceOff } from "@/lib/marketing/config";

export const MARKETING_IMMEDIATE_PUBLISH_SETTING_KEY =
  "marketing_immediate_publish_enabled";

/**
 * Runtime gate for approve-and-publish-now (DB-backed, no redeploy).
 * Default OFF when the setting row is missing (operator must enable explicitly).
 */
export async function isImmediatePublishEnabled(): Promise<boolean> {
  if (isMarketingBufferPublishForceOff()) return false;
  if (!isBufferCredentialsPresent()) return false;

  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", MARKETING_IMMEDIATE_PUBLISH_SETTING_KEY)
    .maybeSingle();

  if (error) {
    // Fail closed on read errors so we do not publish blindly.
    return false;
  }

  return parseBillingFlag(data?.value, false);
}

export async function setImmediatePublishEnabled(
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    {
      key: MARKETING_IMMEDIATE_PUBLISH_SETTING_KEY,
      value: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
