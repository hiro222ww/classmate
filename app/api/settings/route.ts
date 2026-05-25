import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS = {
  global_join_window: {
    enabled: false,
    start: "21:00",
    end: "21:30",
  },
  billing_notice: {
    enabled: true,
    text: "",
  },
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["global_join_window", "billing_notice"]);

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
    }

    return NextResponse.json({
      ok: true,
      settings,
    });
  } catch (e: any) {
    console.error("[settings][GET]", e);

    return NextResponse.json(
      { ok: false, error: e?.message ?? "server_error" },
      { status: 500 }
    );
  }
}