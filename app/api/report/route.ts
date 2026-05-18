import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedReasons = new Set([
  "迷惑行為",
  "性的な発言・行為",
  "嫌がらせ",
  "スパム",
  "その他",
]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const reporter_device_id = String(body.reporterDeviceId ?? "").trim();
    const target_device_id = String(body.targetDeviceId ?? "").trim() || null;
    const session_id = String(body.sessionId ?? "").trim() || null;
    const class_id = String(body.classId ?? "").trim() || null;
    const reason = String(body.reason ?? "").trim();
    const detail = String(body.detail ?? "").trim() || null;

    if (!reporter_device_id) {
      return NextResponse.json(
        { ok: false, error: "reporterDeviceId is required" },
        { status: 400 }
      );
    }

    if (!reason || !allowedReasons.has(reason)) {
      return NextResponse.json(
        { ok: false, error: "invalid reason" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("user_reports")
      .insert({
        reporter_device_id,
        target_device_id,
        session_id,
        class_id,
        reason,
        detail,
        status: "open",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reportId: data.id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "report_failed" },
      { status: 500 }
    );
  }
}