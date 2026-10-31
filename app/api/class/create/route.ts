import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { moderateUserText } from "@/lib/contentModeration";
import { resolveApiActor } from "@/lib/actorIdentity";
import { lookupEntitlements } from "@/lib/userIdentityMigration";
import {
  assertPublicCreateFlags,
  hasCreateClassEntitlement,
  normalizeCreateMinAge,
} from "@/lib/classCreateGuards";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    deviceId,
    name,
    description,
    worldKey,
    topicKey,
    minAge,
    isSensitive,
    isPremium,
  } = body ?? {};

  if (!deviceId || !name) {
    return NextResponse.json(
      { error: "deviceId & name required" },
      { status: 400 }
    );
  }

  const actorResult = await resolveApiActor({ req, deviceId });
  if (!actorResult.ok) {
    return NextResponse.json(
      { error: actorResult.error, message: actorResult.message },
      { status: actorResult.status }
    );
  }

  const flagCheck = assertPublicCreateFlags({ isSensitive, isPremium });
  if (!flagCheck.ok) {
    return NextResponse.json(
      { ok: false, error: flagCheck.error, message: flagCheck.message },
      { status: 403 }
    );
  }

  const ageCheck = normalizeCreateMinAge(minAge);
  if (!ageCheck.ok) {
    return NextResponse.json(
      { ok: false, error: ageCheck.error, message: ageCheck.message },
      { status: 400 }
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

  if (!hasCreateClassEntitlement(entitlements)) {
    return NextResponse.json(
      {
        ok: false,
        error: "create_permission_denied",
        message: "クラス作成にはクラス枠またはテーマ課金の契約が必要です。",
      },
      { status: 403 }
    );
  }

  const { data, error } = await sb.rpc("create_class", {
    p_device_id: actorResult.actor.deviceId,
    p_name: className,
    p_description: classDescription,
    p_world_key: worldKey ?? "default",
    p_topic_key: topicKey ?? "free_talk",
    p_min_age: ageCheck.minAge,
    p_is_sensitive: false,
    p_is_premium: false,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "create_class_failed" },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true, classId: data });
}
