import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emitClassMessageCreatedEvent } from "@/lib/notificationEvents";
import { moderateUserText } from "@/lib/contentModeration";
import { dispatchNotificationWebPush } from "@/lib/webPushServer";

export async function POST(req: Request) {
  const { deviceId, classId, message } = await req.json();
  if (!deviceId || !classId || !message) {
    return NextResponse.json({ error: "deviceId, classId, message required" }, { status: 400 });
  }

  const sb = supabaseServer();

  const prof = await sb.from("user_profiles").select("device_id").eq("device_id", deviceId).maybeSingle();
  if (!prof.data) return NextResponse.json({ error: "profile_not_found" }, { status: 403 });

  const trimmed = String(message).trim();
  if (!trimmed) return NextResponse.json({ ok: true });

  const moderation = await moderateUserText(trimmed);
  if (!moderation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: moderation.block ? "contact_exchange_blocked" : "contact_exchange_warning",
        message: moderation.message,
      },
      { status: moderation.block ? 400 : 400 }
    );
  }

  const { error } = await sb.rpc("post_class_message", {
    p_device_id: deviceId,
    p_class_id: classId,
    p_message: trimmed,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eventRes = await emitClassMessageCreatedEvent({
    classId: String(classId),
    actorDeviceId: String(deviceId),
    message: trimmed,
  });

  if (eventRes.ok && eventRes.id) {
    await dispatchNotificationWebPush(eventRes.id);
  }

  return NextResponse.json({ ok: true });
}
