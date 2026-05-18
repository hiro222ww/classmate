import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const blocker_device_id = String(body.blockerDeviceId ?? "").trim();
    const blocked_device_id = String(body.blockedDeviceId ?? "").trim();

    if (!blocker_device_id) {
      return NextResponse.json(
        { ok: false, error: "blockerDeviceId is required" },
        { status: 400 }
      );
    }

    if (!blocked_device_id) {
      return NextResponse.json(
        { ok: false, error: "blockedDeviceId is required" },
        { status: 400 }
      );
    }

    if (blocker_device_id === blocked_device_id) {
      return NextResponse.json(
        { ok: false, error: "cannot block yourself" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("user_blocks")
      .upsert(
        {
          blocker_device_id,
          blocked_device_id,
        },
        {
          onConflict: "blocker_device_id,blocked_device_id",
        }
      );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "block_failed" },
      { status: 500 }
    );
  }
}