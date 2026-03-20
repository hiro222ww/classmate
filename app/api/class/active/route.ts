// app/api/class/active/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { deviceId } = await req.json();

    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId required" },
        { status: 400 }
      );
    }

    const sb = supabaseServer();

    const prof = await sb
      .from("user_profiles")
      .select("device_id")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (!prof.data) {
      return NextResponse.json(
        { error: "profile_not_found" },
        { status: 403 }
      );
    }

    // ここでは「所属済みの中から1件返すだけ」
    // 自動割当・新規参加はしない
    const { data, error } = await sb
      .from("class_memberships")
      .select(`
        class_id,
        classes (
          id,
          name,
          world_key,
          topic_key,
          min_age,
          is_sensitive
        )
      `)
      .eq("device_id", deviceId)
      .order("class_id", { ascending: true })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const row = data?.[0];
    const c = Array.isArray(row?.classes) ? row?.classes?.[0] : row?.classes;

    const activeClass = c
      ? {
          class_id: c.id,
          class_name: c.name ?? "クラス",
          world_key: c.world_key ?? null,
          topic_key: c.topic_key ?? null,
          min_age: c.min_age ?? 0,
          is_sensitive: Boolean(c.is_sensitive),
          is_premium: false,
        }
      : null;

    return NextResponse.json({ activeClass });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "active_class_failed" },
      { status: 500 }
    );
  }
}