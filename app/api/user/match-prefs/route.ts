import { NextResponse } from "next/server";
import { getMinorsEnabled } from "@/lib/minorsSettings";
import {
  defaultMatchPrefs,
  ensureMatchPrefsRow,
  readMatchPrefs,
  userProfileDeviceExists,
} from "@/lib/matchPrefsStorage";
import { supabaseServer } from "@/lib/supabaseServer";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeAgeRange(minAge: unknown, maxAge: unknown) {
  const minA = clamp(Number(minAge ?? 0), 0, 130);
  const maxA = clamp(Number(maxAge ?? 130), 0, 130);
  let fixedMin = Math.min(minA, maxA);
  let fixedMax = Math.max(minA, maxA);
  return { fixedMin, fixedMax };
}

async function applyMinorsGuard(fixedMin: number, fixedMax: number) {
  const minorsEnabled = await getMinorsEnabled();
  if (!minorsEnabled && fixedMax < 18) {
    fixedMax = 18;
    fixedMin = Math.min(fixedMin, fixedMax);
  }
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

  const deviceId = String(body.deviceId ?? "").trim();
  const mode = String(body.mode ?? "").trim();

  if (!deviceId) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  }

  const sb = supabaseServer();

  let profileExists: boolean;
  try {
    profileExists = await userProfileDeviceExists(sb, deviceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "profile_lookup_failed";
    console.error("[match-prefs] profile lookup failed", {
      deviceTail: deviceId.slice(-4),
      message,
    });
    return NextResponse.json(
      { error: "profile_lookup_failed", detail: message },
      { status: 500 }
    );
  }

  if (mode === "get") {
    if (!profileExists) {
      return NextResponse.json({
        prefs: defaultMatchPrefs(deviceId),
        profileRequired: true,
      });
    }

    try {
      const existing = await readMatchPrefs(sb, deviceId);
      if (existing) {
        return NextResponse.json({ prefs: existing });
      }

      const ensured = await ensureMatchPrefsRow(sb, deviceId);
      return NextResponse.json({ prefs: ensured });
    } catch (error) {
      const message = error instanceof Error ? error.message : "match_prefs_get_failed";
      console.error("[match-prefs] get failed", {
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

  const normalized = normalizeAgeRange(body.minAge, body.maxAge);
  const guarded = await applyMinorsGuard(
    normalized.fixedMin,
    normalized.fixedMax
  );

  try {
    const saved = await ensureMatchPrefsRow(sb, deviceId, {
      min_age: guarded.fixedMin,
      max_age: guarded.fixedMax,
    });

    return NextResponse.json({
      ok: true,
      minAge: saved.min_age,
      maxAge: saved.max_age,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "match_prefs_update_failed";
    console.error("[match-prefs] save failed", {
      deviceTail: deviceId.slice(-4),
      message,
    });
    return NextResponse.json(
      { error: "match_prefs_update_failed", detail: message },
      { status: 500 }
    );
  }
}
