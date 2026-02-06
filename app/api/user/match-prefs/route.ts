import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function POST(req: Request) {
  const { deviceId, minAge, maxAge, mode } = await req.json();
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  const sb = supabaseServer();

  const prof = await sb.from("user_profiles").select("device_id").eq("device_id", deviceId).maybeSingle();
  if (!prof.data) return NextResponse.json({ error: "profile_not_found" }, { status: 403 });

  await sb.rpc("ensure_match_prefs", { p_device_id: deviceId });

  if (mode === "get") {
    const { data, error } = await sb.from("user_match_prefs").select("*").eq("device_id", deviceId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prefs: data });
  }

  const minA = clamp(Number(minAge ?? 18), 0, 120);
  const maxA = clamp(Number(maxAge ?? 25), 0, 120);
  const fixedMin = Math.min(minA, maxA);
  const fixedMax = Math.max(minA, maxA);

  const { error } = await sb
    .from("user_match_prefs")
    .update({ min_age: fixedMin, max_age: fixedMax })
    .eq("device_id", deviceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, minAge: fixedMin, maxAge: fixedMax });
}
