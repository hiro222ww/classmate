import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "open";
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  let query = supabaseAdmin
    .from("user_reports")
    .select(
      "id, created_at, reporter_device_id, target_device_id, session_id, class_id, reason, detail, status, admin_note"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    reports: data ?? [],
  });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "").trim();
  const admin_note = String(body.adminNote ?? "").trim() || null;

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 }
    );
  }

  if (!["open", "reviewing", "resolved", "dismissed"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "invalid status" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("user_reports")
    .update({
      status,
      admin_note,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    report: data,
  });
}