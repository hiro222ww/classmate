import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getMinorsEnabled } from "@/lib/minorsSettings";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function POST(req: Request) {
  const { deviceId, minAge, maxAge, mode } = await req.json();

  if (!deviceId) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  }

  const sb = supabaseServer();

  // user_profiles が未作成でも落とさず、prefs 行を確保
  const { error: ensureErr } = await sb.rpc("ensure_match_prefs", {
    p_device_id: deviceId,
  });

  if (ensureErr) {
    return NextResponse.json(
      { error: "ensure_match_prefs_failed", detail: ensureErr.message },
      { status: 500 }
    );
  }

  if (mode === "get") {
    const { data, error } = await sb
      .from("user_match_prefs")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "match_prefs_get_failed", detail: error.message },
        { status: 500 }
      );
    }

    // 念のため未作成時も安全に返す（OFF = 全年代）
    return NextResponse.json({
      prefs: data ?? {
        device_id: deviceId,
        min_age: 0,
        max_age: 130,
      },
    });
  }

  const minA = clamp(Number(minAge ?? 0), 0, 130);
  const maxA = clamp(Number(maxAge ?? 130), 0, 130);
  let fixedMin = Math.min(minA, maxA);
  let fixedMax = Math.max(minA, maxA);

  const minorsEnabled = await getMinorsEnabled();
  if (!minorsEnabled && fixedMax < 18) {
    fixedMax = 18;
    fixedMin = Math.min(fixedMin, fixedMax);
  }

  const { error } = await sb
    .from("user_match_prefs")
    .update({
      min_age: fixedMin,
      max_age: fixedMax,
    })
    .eq("device_id", deviceId);

  if (error) {
    return NextResponse.json(
      { error: "match_prefs_update_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    minAge: fixedMin,
    maxAge: fixedMax,
  });
}