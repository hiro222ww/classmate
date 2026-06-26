import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getRecruitmentSessionTtlSetting,
  parseRecruitmentSessionTtlValue,
  type RecruitmentSessionTtlSetting,
} from "@/lib/recruitmentSettings";
import { DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES } from "@/lib/recruitment";
import {
  getEffectiveAgeMode,
  isProductionAgeLocked,
  parseAgeModeValue,
  ageModeFromLegacyMinors,
} from "@/lib/agePolicy";
import { parseMinorsEnabledValue } from "@/lib/minorsSettings";
import {
  DEFAULT_BILLING_NOTICE_TEXT,
  normalizeBillingNotice,
} from "@/lib/billingNoticeDefaults";
import {
  billingNoticeFromCopy,
  normalizeBillingCopy,
  type BillingCopySettings,
} from "@/lib/billingCopySettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS: {
  global_join_window: {
    enabled: boolean;
    start: string;
    end: string;
  };
  billing_notice: {
    enabled: boolean;
    text: string;
  };
  billing_copy: BillingCopySettings;
  recruitment_session_ttl_minutes: RecruitmentSessionTtlSetting;
  minors_enabled: boolean;
  age_mode: string;
} = {
  global_join_window: {
    enabled: false,
    start: "21:00",
    end: "21:30",
  },
  billing_notice: {
    enabled: true,
    text: DEFAULT_BILLING_NOTICE_TEXT,
  },
  billing_copy: normalizeBillingCopy(null),
  recruitment_session_ttl_minutes: {
    minutes: DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES,
    unlimited: false,
  },
  minors_enabled: false,
  age_mode: "post_high_school_only",
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "global_join_window",
        "billing_notice",
        "billing_copy",
        "recruitment_session_ttl_minutes",
        "minors_enabled",
        "age_mode",
      ]);

    if (error) throw error;

    const settings = structuredClone(DEFAULT_SETTINGS);

    for (const row of data ?? []) {
      if (row.key === "global_join_window") {
        settings.global_join_window = {
          ...settings.global_join_window,
          ...(row.value ?? {}),
        };
      }

      if (row.key === "billing_notice") {
        settings.billing_notice = normalizeBillingNotice({
          ...settings.billing_notice,
          ...(row.value ?? {}),
        });
      }

      if (row.key === "billing_copy") {
        settings.billing_copy = normalizeBillingCopy(
          row.value,
          settings.billing_notice
        );
      }

      if (row.key === "recruitment_session_ttl_minutes") {
        settings.recruitment_session_ttl_minutes =
          parseRecruitmentSessionTtlValue(row.value);
      }

      if (row.key === "minors_enabled") {
        settings.minors_enabled = parseMinorsEnabledValue(row.value);
      }

      if (row.key === "age_mode") {
        settings.age_mode =
          parseAgeModeValue(row.value) ??
          ageModeFromLegacyMinors(settings.minors_enabled);
      }
    }

    const ttlSetting = await getRecruitmentSessionTtlSetting();
    const effectiveAgeMode = await getEffectiveAgeMode();

    settings.billing_copy = normalizeBillingCopy(
      settings.billing_copy,
      settings.billing_notice
    );
    settings.billing_notice = billingNoticeFromCopy(settings.billing_copy);

    return NextResponse.json({
      ok: true,
      settings,
      minors_enabled: settings.minors_enabled,
      age_mode: effectiveAgeMode,
      production_age_locked: isProductionAgeLocked(),
      recruitment_session_ttl_minutes: ttlSetting.minutes,
      recruitment_session_ttl_unlimited: ttlSetting.unlimited,
    });
  } catch (e: unknown) {
    console.error("[settings][GET]", e);

    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
