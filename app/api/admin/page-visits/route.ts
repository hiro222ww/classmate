import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tokyoTodayRangeIso } from "@/lib/pageVisit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VisitRow = {
  id: string;
  user_id: string | null;
  device_id: string | null;
  path: string;
  visited_at: string;
  referrer: string | null;
};

function visitorKey(row: { user_id?: string | null; device_id?: string | null }) {
  const userId = String(row.user_id ?? "").trim();
  if (userId) return `u:${userId}`;
  const deviceId = String(row.device_id ?? "").trim();
  if (deviceId) return `d:${deviceId}`;
  return null;
}

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const recentLimit = Math.min(
      Math.max(Number(searchParams.get("recentLimit") ?? 50) || 50, 1),
      200
    );
    const pathLimit = Math.min(
      Math.max(Number(searchParams.get("pathLimit") ?? 30) || 30, 1),
      100
    );

    const { startIso, endIso, day } = tokyoTodayRangeIso();

    const { data: todayRows, error: todayError } = await supabaseAdmin
      .from("page_visits")
      .select("id, user_id, device_id, path, visited_at")
      .gte("visited_at", startIso)
      .lte("visited_at", endIso)
      .limit(5000);

    if (todayError) {
      return NextResponse.json(
        {
          ok: false,
          error: "page_visits_today_failed",
          detail: todayError.message,
        },
        { status: 500 }
      );
    }

    const today = (todayRows ?? []) as Array<{
      id: string;
      user_id: string | null;
      device_id: string | null;
      path: string;
      visited_at: string;
    }>;

    const unique = new Set<string>();
    const byPathMap = new Map<string, number>();
    for (const row of today) {
      const key = visitorKey(row);
      if (key) unique.add(key);
      const path = String(row.path ?? "").trim() || "/";
      byPathMap.set(path, (byPathMap.get(path) ?? 0) + 1);
    }

    const by_path = Array.from(byPathMap.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
      .slice(0, pathLimit);

    const { data: recentRaw, error: recentError } = await supabaseAdmin
      .from("page_visits")
      .select("id, user_id, device_id, path, visited_at, referrer")
      .order("visited_at", { ascending: false })
      .limit(recentLimit);

    if (recentError) {
      return NextResponse.json(
        {
          ok: false,
          error: "page_visits_recent_failed",
          detail: recentError.message,
        },
        { status: 500 }
      );
    }

    const recentRows = (recentRaw ?? []) as VisitRow[];
    const userIds = Array.from(
      new Set(
        recentRows
          .map((r) => String(r.user_id ?? "").trim())
          .filter(Boolean)
      )
    );
    const deviceIds = Array.from(
      new Set(
        recentRows
          .map((r) => String(r.device_id ?? "").trim())
          .filter(Boolean)
      )
    );

    const nameByUserId = new Map<string, string>();
    const nameByDeviceId = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: byUser } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      for (const row of byUser ?? []) {
        const uid = String((row as { user_id?: unknown }).user_id ?? "").trim();
        const name = String(
          (row as { display_name?: unknown }).display_name ?? ""
        ).trim();
        if (uid && name) nameByUserId.set(uid, name);
      }
    }

    if (deviceIds.length > 0) {
      const { data: byDevice } = await supabaseAdmin
        .from("user_profiles")
        .select("device_id, display_name")
        .in("device_id", deviceIds);
      for (const row of byDevice ?? []) {
        const did = String(
          (row as { device_id?: unknown }).device_id ?? ""
        ).trim();
        const name = String(
          (row as { display_name?: unknown }).display_name ?? ""
        ).trim();
        if (did && name) nameByDeviceId.set(did, name);
      }
    }

    const recent = recentRows.map((row) => {
      const userId = String(row.user_id ?? "").trim() || null;
      const deviceId = String(row.device_id ?? "").trim() || null;
      const display_name =
        (userId ? nameByUserId.get(userId) : null) ??
        (deviceId ? nameByDeviceId.get(deviceId) : null) ??
        null;
      return {
        id: row.id,
        user_id: userId,
        device_id: deviceId,
        path: row.path,
        visited_at: row.visited_at,
        referrer: row.referrer,
        display_name,
      };
    });

    return NextResponse.json({
      ok: true,
      day,
      summary: {
        today_count: today.length,
        today_unique_visitors: unique.size,
      },
      by_path,
      recent,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "page_visits_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
