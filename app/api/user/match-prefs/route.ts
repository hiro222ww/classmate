import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

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

    // 念のため未作成時も安全に返す
    return NextResponse.json({
      prefs: data ?? {
        device_id: deviceId,
        min_age: 18,
        max_age: 25,
      },
    });
  }

  const minA = clamp(Number(minAge ?? 18), 0, 120);
  const maxA = clamp(Number(maxAge ?? 25), 0, 120);
  const fixedMin = Math.min(minA, maxA);
  const fixedMax = Math.max(minA, maxA);

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