import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function normalizeDeviceId(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeName(v: unknown) {
  return String(v ?? "").trim();
}

async function loadProfiles(
  sb: ReturnType<typeof supabaseServer>,
  deviceIds: string[]
) {
  const ids = Array.from(
    new Set(deviceIds.map((id) => normalizeDeviceId(id)).filter(Boolean))
  );

  if (ids.length === 0) {
    return {
      ok: true as const,
      profileMap: new Map<string, any>(),
    };
  }

  const { data, error } = await sb
    .from("user_profiles")
    .select("device_id, display_name, photo_path")
    .in("device_id", ids);

  if (error) {
    return {
      ok: false as const,
      error,
      profileMap: new Map<string, any>(),
    };
  }

  const profileMap = new Map<string, any>();

  for (const p of data ?? []) {
    const did = normalizeDeviceId((p as any).device_id);
    if (!did) continue;
    profileMap.set(did, p);
  }

  return {
    ok: true as const,
    profileMap,
  };
}

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

    // sessionId がある場合：
    // 今その通話/待機ルームにいる人を session_members から取る
    if (sessionId) {
      const { data: sessionRows, error: sessionErr } = await sb
        .from("session_members")
        .select("device_id, display_name, joined_at")
        .eq("session_id", sessionId)
        .order("joined_at", { ascending: true });

      if (sessionErr) {
        return NextResponse.json(
          {
            ok: false,
            error: "session_members_failed",
            detail: sessionErr.message,
          },
          { status: 500 }
        );
      }

      const deviceIds = (sessionRows ?? [])
        .map((row: any) => normalizeDeviceId(row.device_id))
        .filter(Boolean);

      const profilesRes = await loadProfiles(sb, deviceIds);

      if (!profilesRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "profiles_failed",
            detail: profilesRes.error.message,
          },
          { status: 500 }
        );
      }

      const members = (sessionRows ?? [])
        .map((row: any) => {
          const did = normalizeDeviceId(row.device_id);
          if (!did) return null;

          const profile = profilesRes.profileMap.get(did);

          return {
            device_id: did,
            joined_at: row.joined_at ?? null,
            display_name:
              normalizeName(profile?.display_name) ||
              normalizeName(row.display_name) ||
              "メンバー",
            photo_path: profile?.photo_path ?? null,
          };
        })
        .filter(Boolean);

      return NextResponse.json({
        ok: true,
        source: "session_members",
        sessionId,
        classId,
        members,
      });
    }

    // sessionId がない場合：
    // 従来通り、そのクラスに所属している人を class_memberships から取る
    const { data: membershipRows, error: membershipErr } = await sb
      .from("class_memberships")
      .select("device_id, joined_at")
      .eq("class_id", classId)
      .order("joined_at", { ascending: true });

    if (membershipErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_members_failed",
          detail: membershipErr.message,
        },
        { status: 500 }
      );
    }

    const deviceIds = (membershipRows ?? [])
      .map((row: any) => normalizeDeviceId(row.device_id))
      .filter(Boolean);

    const profilesRes = await loadProfiles(sb, deviceIds);

    if (!profilesRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "profiles_failed",
          detail: profilesRes.error.message,
        },
        { status: 500 }
      );
    }

    const members = (membershipRows ?? [])
      .map((row: any) => {
        const did = normalizeDeviceId(row.device_id);
        if (!did) return null;

        const profile = profilesRes.profileMap.get(did);

        return {
          device_id: did,
          joined_at: row.joined_at ?? null,
          display_name:
            normalizeName(profile?.display_name) ||
            "メンバー",
          photo_path: profile?.photo_path ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      ok: true,
      source: "class_memberships",
      classId,
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