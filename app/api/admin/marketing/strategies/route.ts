import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  activateStrategyVersion,
  deactivateActiveStrategy,
  getActiveStrategy,
  listStrategyVersions,
} from "@/lib/marketing/strategy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const [active, versions] = await Promise.all([
      getActiveStrategy(),
      listStrategyVersions(40),
    ]);
    return NextResponse.json({ ok: true, active, versions });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "strategies_failed";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        migrationHint:
          "Apply supabase/migrations/20261117120000_marketing_phase4_reports.sql",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();

    if (action === "activate") {
      const id = String(body.id ?? "").trim();
      if (!id) {
        return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
      }
      const result = await activateStrategyVersion(id);
      return NextResponse.json(result, { status: result.ok ? 200 : 500 });
    }

    if (action === "deactivate") {
      const result = await deactivateActiveStrategy();
      return NextResponse.json(result, { status: result.ok ? 200 : 500 });
    }

    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "strategies_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
