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
import { adminActorFromRequest, writeAdminAuditLog } from "@/lib/adminAuditLog";
import {
  parseRecruitmentSessionTtlValue,
  type RecruitmentSessionTtlSetting,
} from "@/lib/recruitmentSettings";
import { DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES } from "@/lib/recruitment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AppSettings = {
  global_join_window: {
    enabled: boolean;
    start: string;
    end: string;
  };
  billing_notice: {
    enabled: boolean;
    text: string;
  };
  recruitment_session_ttl_minutes: RecruitmentSessionTtlSetting;
  minors_enabled: boolean;
  age_mode: AgeMode;
};

const DEFAULT_SETTINGS: AppSettings = {
  global_join_window: {
    enabled: false,
    start: "21:00",
    end: "21:30",
  },
  billing_notice: {
    enabled: true,
    text: DEFAULT_BILLING_NOTICE_TEXT,
  },
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
      "global_join_window",
      "billing_notice",
      "recruitment_session_ttl_minutes",
      "minors_enabled",
      "age_mode",
    ]);

  if (error) throw error;
  return data ?? [];
}

async function readSettings(): Promise<AppSettings> {
  const settings = structuredClone(DEFAULT_SETTINGS);

  for (const row of await readRawSettings()) {
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

  settings.age_mode = await getEffectiveAgeMode();

  return settings;
}

export async function GET(req: Request) {
  try {
    const denied = requireAdmin(req);
    if (denied) return denied;

    const settings = await readSettings();

    return NextResponse.json({
      ok: true,
      ...settings,
      settings,
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

    const globalJoinWindow = body.global_join_window ?? {};
    const billingNotice = body.billing_notice ?? {};
    const requestedMinorsEnabled = Boolean(body.minors_enabled);
    const requestedAgeMode =
      parseAgeModeValue(body.age_mode) ??
      ageModeFromLegacyMinors(requestedMinorsEnabled);

    const persistCheck = canPersistMinorsOrAgeModeChange({
      nextMinorsEnabled: requestedMinorsEnabled,
      nextAgeMode: requestedAgeMode,
    });
    if (!persistCheck.allowed) {
      return NextResponse.json(
        { ok: false, error: "production_age_locked", message: persistCheck.reason },
        { status: 403 }
      );
    }

    const nextSettings: AppSettings = {
      global_join_window: {
        enabled: Boolean(globalJoinWindow.enabled),
        start: String(globalJoinWindow.start ?? "21:00").trim(),
        end: String(globalJoinWindow.end ?? "21:30").trim(),
      },
      billing_notice: {
        enabled: Boolean(billingNotice.enabled),
        text: String(billingNotice.text ?? "").trim(),
      },
      recruitment_session_ttl_minutes:
        body.recruitment_session_ttl_minutes != null
          ? parseRecruitmentSessionTtlValue(body.recruitment_session_ttl_minutes)
          : beforeSettings.recruitment_session_ttl_minutes,
      minors_enabled: requestedMinorsEnabled,
      age_mode: requestedAgeMode,
    };

    const rows = [
      {
        key: "global_join_window",
        value: nextSettings.global_join_window,
        updated_at: new Date().toISOString(),
      },
      {
        key: "billing_notice",
        value: nextSettings.billing_notice,
        updated_at: new Date().toISOString(),
      },
      {
        key: "recruitment_session_ttl_minutes",
        value: nextSettings.recruitment_session_ttl_minutes,
        updated_at: new Date().toISOString(),
      },
      {
        key: "minors_enabled",
        value: nextSettings.minors_enabled,
        updated_at: new Date().toISOString(),
      },
      {
        key: "age_mode",
        value: nextSettings.age_mode,
        updated_at: new Date().toISOString(),
      },
    ];

    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });

    if (error) throw error;

    clearAgePolicyCache();

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
