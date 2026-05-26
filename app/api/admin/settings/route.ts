import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clearRecruitmentSessionTtlCache } from "@/lib/recruitmentSettings";
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
  recruitment_session_ttl_minutes: {
    minutes: number | null;
    unlimited: boolean;
  };
};

const DEFAULT_SETTINGS: AppSettings = {
  global_join_window: {
    enabled: false,
    start: "21:00",
    end: "21:30",
  },
  billing_notice: {
    enabled: true,
    text: "※ 現在、ベーシック・ミドル・プレミアムで利用できるテーマは同じです。プランの違いは、同時に参加できるクラス数です。",
  },
  recruitment_session_ttl_minutes: {
    minutes: DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES,
    unlimited: false,
  },
};

function normalizeRecruitmentTtlInput(raw: unknown): AppSettings["recruitment_session_ttl_minutes"] {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_SETTINGS.recruitment_session_ttl_minutes;
  }

  const obj = raw as Record<string, unknown>;
  if (obj.unlimited === true) {
    return { minutes: null, unlimited: true };
  }

  const n = Number(obj.minutes);
  const minutes =
    Number.isFinite(n) && n > 0
      ? Math.max(1, Math.min(1440, Math.floor(n)))
      : DEFAULT_RECRUITMENT_SESSION_TTL_MINUTES;

  return { minutes, unlimited: false };
}

async function readSettings(): Promise<AppSettings> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "global_join_window",
      "billing_notice",
      "recruitment_session_ttl_minutes",
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
      settings.billing_notice = {
        ...settings.billing_notice,
        ...(row.value ?? {}),
      };
    }

    if (row.key === "recruitment_session_ttl_minutes") {
      settings.recruitment_session_ttl_minutes = normalizeRecruitmentTtlInput(
        row.value
      );
    }
  }

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
    });
  } catch (e: any) {
    console.error("[admin/settings][GET]", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "server_error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const denied = requireAdmin(req);
    if (denied) return denied;

    const body = await req.json().catch(() => ({}));

    const globalJoinWindow = body.global_join_window ?? {};
    const billingNotice = body.billing_notice ?? {};
    const recruitmentTtl = normalizeRecruitmentTtlInput(
      body.recruitment_session_ttl_minutes
    );

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
      recruitment_session_ttl_minutes: recruitmentTtl,
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
    ];

    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });

    if (error) throw error;

    clearRecruitmentSessionTtlCache();

    return NextResponse.json({
      ok: true,
      ...nextSettings,
      settings: nextSettings,
    });
  } catch (e: any) {
    console.error("[admin/settings][POST]", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "server_error",
      },
      { status: 500 }
    );
  }
}
