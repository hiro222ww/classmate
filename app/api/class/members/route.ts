import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const classId = String(searchParams.get("classId") ?? "").trim();
    const sessionId = String(searchParams.get("sessionId") ?? "").trim();

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "class_id_required" },
        { status: 400 }
      );
    }

    const sb = supabaseServer();

    // sessionId がある場合は「今その部屋にいる人」を優先
    if (sessionId) {
      const { data, error } = await sb
        .from("session_members")
        .select("device_id, display_name, joined_at, user_profiles(display_name, photo_path)")
        .eq("session_id", sessionId)
        .order("joined_at", { ascending: true });

      if (error) {
        return NextResponse.json(
          { ok: false, error: "session_members_failed", detail: error.message },
          { status: 500 }
        );
      }

      const members = (data ?? []).map((row: any) => ({
        device_id: String(row.device_id ?? "").trim(),
        joined_at: row.joined_at ?? null,
        display_name:
          String(row.user_profiles?.display_name ?? "").trim() ||
          String(row.display_name ?? "").trim() ||
          "メンバー",
        photo_path: row.user_profiles?.photo_path ?? null,
      }));

      return NextResponse.json({
        ok: true,
        members,
      });
    }

    // sessionId がない場合は従来通り「クラス所属者」
    const { data, error } = await sb
      .from("class_memberships")
      .select("device_id, joined_at, user_profiles(display_name, photo_path)")
      .eq("class_id", classId)
      .order("joined_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "class_members_failed", detail: error.message },
        { status: 500 }
      );
    }

    const members = (data ?? []).map((row: any) => ({
      device_id: String(row.device_id ?? "").trim(),
      joined_at: row.joined_at ?? null,
      display_name:
        String(row.user_profiles?.display_name ?? "").trim() || "メンバー",
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