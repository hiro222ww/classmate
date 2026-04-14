import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body.deviceId ?? "").trim();
    const plan = String(body.plan ?? "free").trim() || "free";
    const class_slots = Math.max(1, Number(body.class_slots ?? 1) || 1);
    const topic_plan = Math.max(0, Number(body.topic_plan ?? 0) || 0);
    const can_create_classes = Boolean(body.can_create_classes);
    const theme_pass = Boolean(body.theme_pass);
    const manual_override = Boolean(body.manual_override);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("user_entitlements")
      .upsert(
        {
          device_id: deviceId,
          plan,
          class_slots,
          topic_plan,
          can_create_classes,
          theme_pass,
          manual_override,
          manual_override_updated_at: manual_override
            ? new Date().toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id" }
      )
      .select(
        "device_id, plan, class_slots, can_create_classes, topic_plan, theme_pass, manual_override, manual_override_updated_at, updated_at"
      )
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_error", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      entitlements: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}