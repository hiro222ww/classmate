import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ageModeFromLegacyMinors,
  clearAgePolicyCache,
  getEffectiveAgeMode,
  isProductionAgeLocked,
  parseAgeModeValue,
  canPersistMinorsOrAgeModeChange,
  type AgeMode,
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
import { adminActorFromRequest, writeAdminAuditLog } from "@/lib/adminAuditLog";
import {
  parseRecruitmentSessionTtlValue,
  type RecruitmentSessionTtlSetting,
} from "@/lib/recruitmentSettings";
import { DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES } from "@/lib/recruitment";
import {
  parseBillingEnabled,
  parseSlotBillingEnabled,
  parseThemeBillingEnabled,
} from "@/lib/billingAvailability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AppSettings = {
  billing_enabled: boolean;
  slot_billing_enabled: boolean;
  theme_billing_enabled: boolean;
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
  age_mode: AgeMode;
};

const DEFAULT_SETTINGS: AppSettings = {
  billing_enabled: true,
  slot_billing_enabled: true,
  theme_billing_enabled: false,
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

async function readRawSettings() {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "billing_enabled",
      "slot_billing_enabled",
      "theme_billing_enabled",
      "global_join_window",
      "billing_notice",
      "billing_copy",
      "recruitment_session_ttl_minutes",
      "minors_enabled",
      "age_mode",
    ]);

  if (error) throw error;
  return data ?? [];
}

async function readSettings(): Promise<AppSettings> {
  const settings = structuredClone(DEFAULT_SETTINGS);
  let sawSlot = false;
  let sawTheme = false;
  let sawLegacy = false;
  let legacyEnabled = false;

  for (const row of await readRawSettings()) {
    if (row.key === "slot_billing_enabled") {
      settings.slot_billing_enabled = parseSlotBillingEnabled(row.value);
      sawSlot = true;
    }
    if (row.key === "theme_billing_enabled") {
      settings.theme_billing_enabled = parseThemeBillingEnabled(row.value);
      sawTheme = true;
    }
    if (row.key === "billing_enabled") {
      legacyEnabled = parseBillingEnabled(row.value);
      sawLegacy = true;
    }
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
      settings.recruitment_session_ttl_minutes = parseRecruitmentSessionTtlValue(
        row.value
      );
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

  if (!sawSlot && !sawTheme && sawLegacy) {
    settings.slot_billing_enabled = legacyEnabled;
    settings.theme_billing_enabled = legacyEnabled;
  }

  settings.billing_enabled =
    settings.slot_billing_enabled || settings.theme_billing_enabled;

  // Keep stored age_mode for save/diff. Do not replace with effective mode
  // (effective may upgrade post_high_school_only → minor_separated_test).
  settings.age_mode =
    parseAgeModeValue(settings.age_mode) ??
    ageModeFromLegacyMinors(settings.minors_enabled);

  settings.billing_copy = normalizeBillingCopy(
    settings.billing_copy,
    settings.billing_notice
  );
  settings.billing_notice = billingNoticeFromCopy(settings.billing_copy);

  return settings;
}

export async function GET(req: Request) {
  try {
    const denied = requireAdmin(req);
    if (denied) return denied;

    const settings = await readSettings();
    const effectiveAgeMode = await getEffectiveAgeMode();

    return NextResponse.json({
      ok: true,
      ...settings,
      settings,
      age_mode: effectiveAgeMode,
      effective_age_mode: effectiveAgeMode,
      production_age_locked: isProductionAgeLocked(),
      allow_minors_experiment: process.env.ALLOW_MINORS_EXPERIMENT === "true",
    });
  } catch (e: unknown) {
    console.error("[admin/settings][GET]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const denied = requireAdmin(req);
    if (denied) return denied;

    const body = await req.json().catch(() => ({}));
    const actor = adminActorFromRequest(req);

    const beforeRows = await readRawSettings();
    const beforeSettings = await readSettings();

    const globalJoinWindow = body.global_join_window;
    if (
      body.slot_billing_enabled !== undefined &&
      typeof body.slot_billing_enabled !== "boolean"
    ) {
      return NextResponse.json(
        { ok: false, error: "slot_billing_enabled_must_be_boolean" },
        { status: 400 }
      );
    }
    if (
      body.theme_billing_enabled !== undefined &&
      typeof body.theme_billing_enabled !== "boolean"
    ) {
      return NextResponse.json(
        { ok: false, error: "theme_billing_enabled_must_be_boolean" },
        { status: 400 }
      );
    }
    if (
      body.billing_enabled !== undefined &&
      typeof body.billing_enabled !== "boolean" &&
      body.slot_billing_enabled === undefined &&
      body.theme_billing_enabled === undefined
    ) {
      return NextResponse.json(
        { ok: false, error: "billing_enabled_must_be_boolean" },
        { status: 400 }
      );
    }

    // Per-key patch: omit a key so the other category is not overwritten.
    let nextSlot = beforeSettings.slot_billing_enabled;
    let nextTheme = beforeSettings.theme_billing_enabled;
    if (typeof body.slot_billing_enabled === "boolean") {
      nextSlot = body.slot_billing_enabled;
    }
    if (typeof body.theme_billing_enabled === "boolean") {
      nextTheme = body.theme_billing_enabled;
    }
    if (
      typeof body.billing_enabled === "boolean" &&
      body.slot_billing_enabled === undefined &&
      body.theme_billing_enabled === undefined
    ) {
      // Legacy single switch: apply to both categories.
      nextSlot = body.billing_enabled;
      nextTheme = body.billing_enabled;
    }

    const billingNotice = body.billing_notice;
    const billingCopyInput = body.billing_copy;
    const touchingAgePolicy =
      body.minors_enabled !== undefined || body.age_mode !== undefined;
    const requestedMinorsEnabled =
      body.minors_enabled !== undefined
        ? Boolean(body.minors_enabled)
        : beforeSettings.minors_enabled;
    // When minors toggle is sent without age_mode, sync age_mode to match.
    // Preserve stored age_mode only when neither age field is present
    // (e.g. billing-only patches).
    let requestedAgeMode: AgeMode;
    if (body.age_mode !== undefined) {
      requestedAgeMode =
        parseAgeModeValue(body.age_mode) ??
        ageModeFromLegacyMinors(requestedMinorsEnabled);
    } else if (body.minors_enabled !== undefined) {
      requestedAgeMode = ageModeFromLegacyMinors(requestedMinorsEnabled);
    } else {
      requestedAgeMode =
        parseAgeModeValue(beforeSettings.age_mode) ??
        ageModeFromLegacyMinors(beforeSettings.minors_enabled);
    }

    if (touchingAgePolicy) {
      const persistCheck = canPersistMinorsOrAgeModeChange({
        nextMinorsEnabled: requestedMinorsEnabled,
        nextAgeMode: requestedAgeMode,
      });
      if (!persistCheck.allowed) {
        return NextResponse.json(
          {
            ok: false,
            error: "production_age_locked",
            message: persistCheck.reason,
          },
          { status: 403 }
        );
      }
    }

    const nextBillingCopy =
      billingCopyInput != null
        ? normalizeBillingCopy(billingCopyInput, beforeSettings.billing_notice)
        : billingNotice != null
          ? normalizeBillingCopy(
              {
                notice: {
                  enabled: Boolean(billingNotice.enabled),
                  text: String(billingNotice.text ?? ""),
                  label: beforeSettings.billing_copy.notice.label,
                },
              },
              beforeSettings.billing_notice
            )
          : beforeSettings.billing_copy;

    const nextSettings: AppSettings = {
      slot_billing_enabled: nextSlot,
      theme_billing_enabled: nextTheme,
      billing_enabled: nextSlot || nextTheme,
      global_join_window:
        globalJoinWindow != null
          ? {
              enabled: Boolean(globalJoinWindow.enabled),
              start: String(globalJoinWindow.start ?? "21:00").trim(),
              end: String(globalJoinWindow.end ?? "21:30").trim(),
            }
          : beforeSettings.global_join_window,
      billing_copy: nextBillingCopy,
      billing_notice: billingNoticeFromCopy(nextBillingCopy),
      recruitment_session_ttl_minutes:
        body.recruitment_session_ttl_minutes != null
          ? parseRecruitmentSessionTtlValue(body.recruitment_session_ttl_minutes)
          : beforeSettings.recruitment_session_ttl_minutes,
      minors_enabled: requestedMinorsEnabled,
      age_mode: requestedAgeMode,
    };

    const now = new Date().toISOString();
    const billingTouched =
      typeof body.slot_billing_enabled === "boolean" ||
      typeof body.theme_billing_enabled === "boolean" ||
      typeof body.billing_enabled === "boolean";
    const rows: Array<{ key: string; value: unknown; updated_at: string }> = [];

    if (billingTouched) {
      rows.push(
        {
          key: "slot_billing_enabled",
          value: { enabled: nextSettings.slot_billing_enabled },
          updated_at: now,
        },
        {
          key: "theme_billing_enabled",
          value: { enabled: nextSettings.theme_billing_enabled },
          updated_at: now,
        },
        {
          key: "billing_enabled",
          value: { enabled: nextSettings.billing_enabled },
          updated_at: now,
        }
      );
    }
    if (globalJoinWindow != null) {
      rows.push({
        key: "global_join_window",
        value: nextSettings.global_join_window,
        updated_at: now,
      });
    }
    if (billingCopyInput != null || billingNotice != null) {
      rows.push(
        {
          key: "billing_notice",
          value: nextSettings.billing_notice,
          updated_at: now,
        },
        {
          key: "billing_copy",
          value: nextSettings.billing_copy,
          updated_at: now,
        }
      );
    }
    if (body.recruitment_session_ttl_minutes != null) {
      rows.push({
        key: "recruitment_session_ttl_minutes",
        value: nextSettings.recruitment_session_ttl_minutes,
        updated_at: now,
      });
    }
    if (touchingAgePolicy) {
      rows.push(
        {
          key: "minors_enabled",
          value: nextSettings.minors_enabled,
          updated_at: now,
        },
        {
          key: "age_mode",
          value: nextSettings.age_mode,
          updated_at: now,
        }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "no_settings_to_update" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw error;

    clearAgePolicyCache();

    if (
      beforeSettings.slot_billing_enabled !== nextSettings.slot_billing_enabled ||
      beforeSettings.theme_billing_enabled !== nextSettings.theme_billing_enabled
    ) {
      await writeAdminAuditLog({
        actor,
        action: "settings.billing_categories",
        target: "app_settings",
        before: {
          slot_billing_enabled: beforeSettings.slot_billing_enabled,
          theme_billing_enabled: beforeSettings.theme_billing_enabled,
        },
        after: {
          slot_billing_enabled: nextSettings.slot_billing_enabled,
          theme_billing_enabled: nextSettings.theme_billing_enabled,
        },
      });
    }

    if (beforeSettings.minors_enabled !== nextSettings.minors_enabled) {
      await writeAdminAuditLog({
        actor,
        action: "settings.minors_enabled",
        target: "app_settings",
        before: { minors_enabled: beforeSettings.minors_enabled },
        after: { minors_enabled: nextSettings.minors_enabled },
      });
    }

    if (beforeSettings.age_mode !== nextSettings.age_mode) {
      await writeAdminAuditLog({
        actor,
        action: "settings.age_mode",
        target: "app_settings",
        before: { age_mode: beforeSettings.age_mode },
        after: { age_mode: nextSettings.age_mode },
      });
    }

    return NextResponse.json({
      ok: true,
      ...nextSettings,
      settings: nextSettings,
      warning: requestedMinorsEnabled
        ? "未成年許可モードは検証環境専用です。本番では ALLOW_MINORS_EXPERIMENT が必要です。"
        : null,
      production_age_locked: isProductionAgeLocked(),
    });
  } catch (e: unknown) {
    console.error("[admin/settings][POST]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
