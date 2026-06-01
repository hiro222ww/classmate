import { NextResponse } from "next/server";
import {
  normalizePushSubscriptionInput,
  upsertPushSubscription,
} from "@/lib/pushSubscriptions";
import { normalizeMeetingDeviceId } from "@/lib/meetingPlan";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = normalizeMeetingDeviceId(body?.device_id ?? body?.deviceId);
    const subscription = normalizePushSubscriptionInput(body?.subscription);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 401 }
      );
    }

    if (!subscription) {
      return NextResponse.json(
        { ok: false, error: "subscription_invalid" },
        { status: 400 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("device_id")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "profile_not_found" },
        { status: 403 }
      );
    }

    const { data: membership } = await supabaseAdmin
      .from("class_memberships")
      .select("class_id")
      .eq("device_id", deviceId)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { ok: false, error: "not_member" },
        { status: 403 }
      );
    }

    const result = await upsertPushSubscription({
      deviceId,
      subscription,
      userAgent: String(body?.user_agent ?? req.headers.get("user-agent") ?? ""),
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: message },
      { status: 500 }
    );
  }
}
