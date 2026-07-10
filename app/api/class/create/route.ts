import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { moderateUserText } from "@/lib/contentModeration";
import { resolveApiActor } from "@/lib/actorIdentity";
import { lookupEntitlements } from "@/lib/userIdentityMigration";

export async function POST(req: Request) {
  const { deviceId, name, description, worldKey, topicKey, minAge, isSensitive, isPremium } =
    await req.json();
  if (!deviceId || !name) {
    return NextResponse.json({ error: "deviceId & name required" }, { status: 400 });
  }

  const actorResult = await resolveApiActor({ req, deviceId });
  if (!actorResult.ok) {
    return NextResponse.json(
      { error: actorResult.error, message: actorResult.message },
      { status: actorResult.status }
    );
  }

  const className = String(name).slice(0, 60);
  const classDescription = String(description ?? "").slice(0, 200);

  for (const value of [className, classDescription]) {
    const moderation = await moderateUserText(value);
    if (!moderation.ok && moderation.block) {
      return NextResponse.json(
        {
          ok: false,
          error: "contact_exchange_blocked",
          message: moderation.message,
        },
        { status: 400 }
      );
    }
  }

  const sb = supabaseServer();

  const entitlements = await lookupEntitlements({
    userId: actorResult.actor.userId,
    deviceId: actorResult.actor.deviceId,
  });

  if (!entitlements) {
    await sb
      .from("user_entitlements")
      .upsert(
        {
          device_id: actorResult.actor.deviceId,
          user_id: actorResult.actor.userId || null,
        },
        { onConflict: "device_id" }
      )
      .select()
      .maybeSingle();
  }

  const { data, error } = await sb.rpc("create_class", {
    p_device_id: actorResult.actor.deviceId,
    p_name: className,
    p_description: classDescription,
    p_world_key: worldKey ?? "default",
    p_topic_key: topicKey ?? "free_talk",
    p_min_age: Number(minAge ?? 0),
    p_is_sensitive: Boolean(isSensitive),
    p_is_premium: Boolean(isPremium),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ classId: data });
}
