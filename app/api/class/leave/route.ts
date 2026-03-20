import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body?.deviceId ?? "").trim();
    const classId = String(body?.classId ?? "").trim();

    console.log("[class/leave] body =", body);
    console.log("[class/leave] deviceId =", deviceId);
    console.log("[class/leave] classId =", classId);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "class_id_missing" },
        { status: 400 }
      );
    }

    const { data: membership, error: findErr } = await supabaseAdmin
      .from("class_memberships")
      .select("class_id")
      .eq("device_id", deviceId)
      .eq("class_id", classId)
      .maybeSingle();

    console.log("[class/leave] membership =", membership);
    console.log("[class/leave] findErr =", findErr);

    if (findErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "membership_lookup_failed",
          detail: findErr.message,
        },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        {
          ok: false,
          error: "not_member",
        },
        { status: 400 }
      );
    }

    const { error: delErr } = await supabaseAdmin
      .from("class_memberships")
      .delete()
      .eq("device_id", deviceId)
      .eq("class_id", classId);

    console.log("[class/leave] delErr =", delErr);

    if (delErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "leave_failed",
          detail: delErr.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      classId,
    });
  } catch (e: any) {
    console.error("[class/leave] internal error =", e);
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        detail: e?.message ?? "unknown_error",
      },
      { status: 500 }
    );
  }
}