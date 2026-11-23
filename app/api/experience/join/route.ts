import { NextResponse } from "next/server";
import { resolveApiActor } from "@/lib/actorIdentity";
import { joinExperienceEvent } from "@/lib/experience/join";
import {
  hasMinimumProfile,
  resolveEffectiveProfileAge,
} from "@/lib/profileClient";
import { isJoinAllowedDeviceId } from "@/lib/deviceIdValidation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const eventId = String(body?.eventId ?? body?.event_id ?? "").trim();
    const deviceIdRaw = String(body?.deviceId ?? body?.device_id ?? "").trim();

    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "missing_event_id" },
        { status: 400 }
      );
    }
    if (!isJoinAllowedDeviceId(deviceIdRaw)) {
      return NextResponse.json(
        { ok: false, error: "invalid_device_id" },
        { status: 400 }
      );
    }

    const actorRes = await resolveApiActor({
      req,
      deviceId: deviceIdRaw,
    });
    if (!actorRes.ok) {
      return NextResponse.json(
        { ok: false, error: actorRes.error },
        { status: actorRes.status }
      );
    }
    const deviceId = actorRes.actor.deviceId || deviceIdRaw;
    const userId = actorRes.actor.userId || null;

    let profile: Record<string, unknown> | null = null;
    if (userId) {
      const byUser = await supabaseAdmin
        .from("user_profiles")
        .select(
          "device_id,display_name,birth_date,gender,declared_age,declared_age_as_of"
        )
        .eq("user_id", userId)
        .maybeSingle();
      profile = (byUser.data as Record<string, unknown> | null) ?? null;
    }
    if (!profile) {
      const byDevice = await supabaseAdmin
        .from("user_profiles")
        .select(
          "device_id,display_name,birth_date,gender,declared_age,declared_age_as_of"
        )
        .eq("device_id", deviceId)
        .maybeSingle();
      profile = (byDevice.data as Record<string, unknown> | null) ?? null;
    }

    if (!hasMinimumProfile(profile as never)) {
      return NextResponse.json(
        { ok: false, error: "profile_required" },
        { status: 403 }
      );
    }
    const age = resolveEffectiveProfileAge(profile as never);
    if (age != null && age < 18) {
      return NextResponse.json(
        { ok: false, error: "age_restricted" },
        { status: 403 }
      );
    }

    const displayName =
      String(profile?.display_name ?? "").trim() || "参加者";

    const result = await joinExperienceEvent({
      eventId,
      deviceId,
      displayName,
      userId,
    });

    if (!result.ok) {
      const status =
        result.error === "event_full"
          ? 409
          : result.error === "feature_disabled" ||
              result.error === "event_not_started" ||
              result.error === "event_ended" ||
              result.error === "event_cancelled"
            ? 403
            : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "join_failed", detail: message },
      { status: 500 }
    );
  }
}
