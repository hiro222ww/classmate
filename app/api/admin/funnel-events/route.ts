import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const recentLimit = Math.min(
      Math.max(Number(searchParams.get("recentLimit") ?? 80) || 80, 1),
      200
    );

    const { data, error } = await supabaseAdmin
      .from("product_funnel_events")
      .select(
        "id, event_name, device_id, user_id, session_id, class_id, meta, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(recentLimit);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "funnel_events_failed",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      recent: data ?? [],
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "funnel_events_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
