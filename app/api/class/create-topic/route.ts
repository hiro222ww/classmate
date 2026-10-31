import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveApiActor } from "@/lib/actorIdentity";
import { lookupEntitlements } from "@/lib/userIdentityMigration";
import {
  assertPublicCreateFlags,
  hasCreateClassEntitlement,
  normalizeCreateMinAge,
} from "@/lib/classCreateGuards";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { deviceId, title, description, minAge, isSensitive, isPremium } =
    body ?? {};
  if (!deviceId || !title) {
    return NextResponse.json(
      { error: "deviceId & title required" },
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

  const sb = supabaseServer();
  const key = `u_${slugify(String(title))}_${Math.floor(Date.now() / 1000)}`;

  const { error } = await sb.rpc("create_topic", {
    p_device_id: actorResult.actor.deviceId,
    p_topic_key: key,
    p_title: String(title).slice(0, 40),
    p_description: String(description ?? "").slice(0, 200),
    p_min_age: ageCheck.minAge,
    p_is_sensitive: false,
    p_is_premium: false,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, topicKey: key });
}
