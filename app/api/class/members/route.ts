import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const classId = String(searchParams.get("classId") ?? "").trim();

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "class_id_required" },
        { status: 400 }
      );
    }

    const sb = supabaseServer();

    const { data, error } = await sb
      .from("class_memberships")
      .select("device_id, joined_at, user_profiles(display_name, photo_path)")
      .eq("class_id", classId);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "class_members_failed", detail: error.message },
        { status: 500 }
      );
    }

    const members = (data ?? []).map((row: any) => ({
      device_id: String(row.device_id ?? ""),
      joined_at: row.joined_at ?? null,
      display_name: row.user_profiles?.display_name ?? "メンバー",
      photo_path: row.user_profiles?.photo_path ?? null,
    }));

    return NextResponse.json({
      ok: true,
      members,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        detail: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}