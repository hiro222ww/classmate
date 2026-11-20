import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runWeeklyMarketingAnalysis } from "@/lib/marketing/weeklyReport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") ?? "").trim();
    if (id) {
      const { data, error } = await supabaseAdmin
        .from("marketing_reports")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: "report_load_failed",
            detail: error.message,
            migrationHint:
              "Apply supabase/migrations/20261117120000_marketing_phase4_reports.sql",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, report: data });
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_reports")
      .select(
        "id, report_kind, status, period_start, period_end, model_name, estimated_cost_usd, created_at, uncertainty_notes"
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "reports_list_failed",
          detail: error.message,
          migrationHint:
            "Apply supabase/migrations/20261117120000_marketing_phase4_reports.sql",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, reports: data ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "reports_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Manual weekly analysis. Does not auto-publish to SNS. */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const activateStrategy = body.activateStrategy === true;
    const result = await runWeeklyMarketingAnalysis({
      trigger: "manual",
      activateStrategy,
    });
    if (!result.ok) {
      const status =
        result.error === "weekly_run_limit_reached" ||
        result.error === "weekly_budget_reached" ||
        result.error === "weekly_already_running"
          ? 429
          : 500;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "weekly_analysis_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
