import { NextResponse } from "next/server";
import {
  applyAgeModeToMatchRange,
  getAgeFilterBounds,
  getEffectiveAgeMode,
  getProfileAge,
  checkSelfAgeForJoin,
  type AgeMode,
} from "@/lib/agePolicy";
import {
  defaultMatchPrefs,
  ensureMatchPrefsForActor,
  readMatchPrefsForActor,
  userProfileActorExists,
} from "@/lib/matchPrefsStorage";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveMatchJoinUserMessage } from "@/lib/matchJoinUserMessage";
import { resolveApiActor } from "@/lib/actorIdentity";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeAgeRange(
  minAge: unknown,
  maxAge: unknown,
  mode: AgeMode,
  selfAge: number | null
) {
  const bounds = getAgeFilterBounds(mode, selfAge);
  const minA = clamp(Number(minAge ?? bounds.defaultMin), bounds.sliderMin, bounds.sliderMax);
  const maxA = clamp(Number(maxAge ?? bounds.defaultMax), bounds.sliderMin, bounds.sliderMax);
  let fixedMin = Math.min(minA, maxA);
  let fixedMax = Math.max(minA, maxA);
  return { fixedMin, fixedMax };
}

function profileRequiredResponse() {
  return NextResponse.json(
    {
      error: "profile_required",
      message: "プロフィール登録後に年齢条件を保存できます。",
    },
    { status: 409 }
  );
}

export async function POST(req: Request) {
  let body: {
    deviceId?: string;
    minAge?: number;
    maxAge?: number;
    mode?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const actorResult = await resolveApiActor({
    req,
    deviceId: body.deviceId,
  });

  if (!actorResult.ok) {
    return NextResponse.json(
      { error: actorResult.error, message: actorResult.message },
      { status: actorResult.status }
    );
  }

  const actor = actorResult.actor;
  const deviceId = actor.deviceId;

  const sb = supabaseServer();

  let profileExists: boolean;
  try {
    profileExists = await userProfileActorExists(sb, actor);
  } catch (error) {
    const message = error instanceof Error ? error.message : "profile_lookup_failed";
    console.error("[match-prefs] profile lookup failed", {
      userId: actor.userId || null,
      deviceTail: deviceId.slice(-4),
      message,
    });
    return NextResponse.json(
      { error: "profile_lookup_failed", detail: message },
      { status: 500 }
    );
  }

  if (body.mode === "get") {
    if (!profileExists) {
      return NextResponse.json({
        prefs: defaultMatchPrefs(deviceId, actor.userId),
        profileRequired: true,
      });
    }

    try {
      const existing = await readMatchPrefsForActor(sb, actor);
      if (existing) {
        return NextResponse.json({ prefs: existing });
      }

      const ensured = await ensureMatchPrefsForActor(sb, actor);
      return NextResponse.json({ prefs: ensured });
    } catch (error) {
      const message = error instanceof Error ? error.message : "match_prefs_get_failed";
      console.error("[match-prefs] get failed", {
        userId: actor.userId || null,
        deviceTail: deviceId.slice(-4),
        message,
      });
      return NextResponse.json(
        { error: "match_prefs_get_failed", detail: message },
        { status: 500 }
      );
    }
  }

  if (!profileExists) {
    return profileRequiredResponse();
  }

  const ageMode = await getEffectiveAgeMode();
  const selfAge = await getProfileAge(deviceId, actor.userId);
  const ageCheck = checkSelfAgeForJoin(selfAge, ageMode);
  if (!ageCheck.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: ageCheck.error,
        message: ageCheck.message || resolveMatchJoinUserMessage(ageCheck.error),
      },
      { status: 403 }
    );
  }

  const normalized = normalizeAgeRange(body.minAge, body.maxAge, ageMode, selfAge);
  const guarded = applyAgeModeToMatchRange(
    ageMode,
    normalized.fixedMin,
    normalized.fixedMax,
    selfAge
  );

  try {
    const saved = await ensureMatchPrefsForActor(sb, actor, {
      min_age: guarded.minAge,
      max_age: guarded.maxAge,
    });

    return NextResponse.json({
      ok: true,
      minAge: saved.min_age,
      maxAge: saved.max_age,
      userId: actor.userId || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "match_prefs_update_failed";
    console.error("[match-prefs] save failed", {
      userId: actor.userId || null,
      deviceTail: deviceId.slice(-4),
      message,
    });
    return NextResponse.json(
      { error: "match_prefs_update_failed", detail: message },
      { status: 500 }
    );
  }
}
