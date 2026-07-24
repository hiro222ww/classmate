import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emitClassMessageCreatedEvent } from "@/lib/notificationEvents";
import { moderateChatText } from "@/lib/chatModeration";
import { dispatchNotificationWebPush } from "@/lib/webPushServer";
import { assertClassMembership } from "@/lib/meetingPlan";
import {
  checkMessageRateLimit,
  validateMessageText,
} from "@/lib/messageLimits";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const deviceId = String(body.deviceId ?? "").trim();
  const classId = String(body.classId ?? "").trim();
  if (!deviceId || !classId || body.message == null) {
    return NextResponse.json(
      { error: "deviceId, classId, message required" },
      { status: 400 }
    );
  }

  const sb = supabaseServer();

  const prof = await sb
    .from("user_profiles")
    .select("device_id")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!prof.data) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 403 });
  }

  const membership = await assertClassMembership(deviceId, classId);
  if (!membership.ok) {
    return NextResponse.json(
      { ok: false, error: membership.error },
      { status: membership.status }
    );
  }

  const validation = validateMessageText(body.message);
  if (!validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: validation.error,
        message: validation.message,
      },
      { status: 400 }
    );
  }

  if (!checkMessageRateLimit(`class:${classId}:${deviceId}`)) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        message: "送信が早すぎます。少し待ってから再送してください",
      },
      { status: 429 }
    );
  }

  const moderation = await moderateChatText(validation.text);
  if (!moderation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: moderation.block
          ? "contact_exchange_blocked"
          : "contact_exchange_warning",
        message: moderation.message,
      },
      { status: 400 }
    );
  }

  const { error } = await sb.rpc("post_class_message", {
    p_device_id: deviceId,
    p_class_id: classId,
    p_message: validation.text,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eventRes = await emitClassMessageCreatedEvent({
    classId: String(classId),
    actorDeviceId: String(deviceId),
    message: validation.text,
  });

  if (eventRes.ok && eventRes.id) {
    await dispatchNotificationWebPush(eventRes.id);
  }

  return NextResponse.json({ ok: true });
}
