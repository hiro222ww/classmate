import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveApiActor } from "@/lib/actorIdentity";
import {
  resolveUserIdForTargetDevice,
} from "@/lib/actorIdentity";

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

    const actorResult = await resolveApiActor({
      req,
      deviceId: blocker_device_id,
    });

    const blocker_user_id =
      actorResult.ok && actorResult.actor.userId
        ? actorResult.actor.userId
        : await resolveUserIdForTargetDevice(blocker_device_id);

    const blocked_user_id = await resolveUserIdForTargetDevice(blocked_device_id);

    const payload: Record<string, string> = {
      blocker_device_id,
      blocked_device_id,
    };

    if (blocker_user_id) payload.blocker_user_id = blocker_user_id;
    if (blocked_user_id) payload.blocked_user_id = blocked_user_id;

    const { error } = await supabaseAdmin
      .from("user_blocks")
      .upsert(payload, {
        onConflict: "blocker_device_id,blocked_device_id",
      });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      blockerUserId: blocker_user_id,
      blockedUserId: blocked_user_id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "block_failed" },
      { status: 500 }
    );
  }
}
