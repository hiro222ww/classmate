import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tokyoTodayRangeIso } from "@/lib/pageVisit";
import {
  buildAdminProfilesRecent,
  countCompleteProfiles,
  countCompleteProfilesCreatedToday,
  type AdminProfileRow,
} from "@/lib/adminProfiles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROFILE_ADMIN_SELECT =
  "device_id, user_id, display_name, birth_date, gender, created_at";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const recentLimit = Math.min(
      Math.max(Number(searchParams.get("recentLimit") ?? 50) || 50, 1),
      200
    );

    const { startIso, endIso, day } = tokyoTodayRangeIso();

    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select(PROFILE_ADMIN_SELECT)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "profiles_fetch_failed",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as AdminProfileRow[];
    const today_count = countCompleteProfilesCreatedToday(
      rows,
      startIso,
      endIso
    );
    const total_count = countCompleteProfiles(rows);
    const recent = buildAdminProfilesRecent(rows, recentLimit);

    return NextResponse.json({
      ok: true,
      day,
      range: { startIso, endIso },
      summary: {
        today_count,
        total_count,
      },
      recent,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "profiles_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
