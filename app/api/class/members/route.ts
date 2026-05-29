import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  logDisplayNameResolution,
  normalizeDisplayNameInput,
  pickLatestSessionMemberByDevice,
  resolveDisplayName,
} from "@/lib/resolveDisplayName";

export const dynamic = "force-dynamic";

function normalizeDeviceId(v: unknown) {
  return normalizeDisplayNameInput(v);
}

async function loadProfiles(
  sb: typeof supabaseAdmin,
  deviceIds: string[]
) {
  const ids = Array.from(
    new Set(deviceIds.map((id) => normalizeDeviceId(id)).filter(Boolean))
  );

  if (ids.length === 0) {
    return {
      ok: true as const,
      profileMap: new Map<string, { display_name?: string | null; photo_path?: string | null }>(),
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
      profileMap: new Map<string, { display_name?: string | null; photo_path?: string | null }>(),
    };
  }

  const profileMap = new Map<
    string,
    { display_name?: string | null; photo_path?: string | null }
  >();

  for (const p of data ?? []) {
    const did = normalizeDeviceId((p as { device_id?: string }).device_id);
    if (!did) continue;
    profileMap.set(did, p as { display_name?: string | null; photo_path?: string | null });
  }

  return {
    ok: true as const,
    profileMap,
  };
}

async function loadPresenceDisplayNames(
  sb: typeof supabaseAdmin,
  classId: string,
  deviceIds: string[]
) {
  const ids = Array.from(
    new Set(deviceIds.map((id) => normalizeDeviceId(id)).filter(Boolean))
  );

  const presenceMap = new Map<string, string>();

  if (!classId || ids.length === 0) {
    return presenceMap;
  }

  const { data, error } = await sb
    .from("class_presence")
    .select("device_id, display_name, last_seen_at")
    .eq("class_id", classId)
    .in("device_id", ids)
    .order("last_seen_at", { ascending: false });

  if (error) {
    if (String(error.message ?? "").includes("display_name")) {
      return presenceMap;
    }
    console.warn("[class/members] presence lookup failed", error.message);
    return presenceMap;
  }

  for (const row of data ?? []) {
    const did = normalizeDeviceId((row as { device_id?: string }).device_id);
    if (!did || presenceMap.has(did)) continue;
    const name = normalizeDisplayNameInput(
      (row as { display_name?: string | null }).display_name
    );
    if (name) presenceMap.set(did, name);
  }

  return presenceMap;
}

function buildMemberRow(input: {
  deviceId: string;
  joinedAt: string | null;
  profile?: { display_name?: string | null; photo_path?: string | null } | null;
  sessionMemberDisplayName?: unknown;
  presenceDisplayName?: unknown;
  context: string;
  classId: string;
  sessionId?: string | null;
}) {
  const resolved = resolveDisplayName({
    profileDisplayName: input.profile?.display_name,
    sessionMemberDisplayName: input.sessionMemberDisplayName,
    presenceDisplayName: input.presenceDisplayName,
  });

  logDisplayNameResolution(input.context, input.deviceId, resolved, {
    classId: input.classId,
    sessionId: input.sessionId ?? null,
  });

  return {
    device_id: input.deviceId,
    joined_at: input.joinedAt,
    display_name: resolved.displayName,
    display_name_source: resolved.source,
    photo_path: input.profile?.photo_path ?? null,
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

    const sb = supabaseAdmin;

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

      const latestByDevice = pickLatestSessionMemberByDevice(sessionRows ?? []);
      const deviceIds = Array.from(latestByDevice.keys());

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

      const presenceMap = await loadPresenceDisplayNames(sb, classId, deviceIds);

      const members = Array.from(latestByDevice.entries())
        .map(([did, row]) =>
          buildMemberRow({
            deviceId: did,
            joinedAt: (row as { joined_at?: string | null }).joined_at ?? null,
            profile: profilesRes.profileMap.get(did),
            sessionMemberDisplayName: (row as { display_name?: string | null })
              .display_name,
            presenceDisplayName: presenceMap.get(did),
            context: "class/members:session",
            classId,
            sessionId,
          })
        )
        .sort((a, b) =>
          String(a.joined_at ?? "").localeCompare(String(b.joined_at ?? ""))
        );

      return NextResponse.json({
        ok: true,
        source: "session_members",
        sessionId,
        classId,
        members,
      });
    }

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
      .map((row) => normalizeDeviceId((row as { device_id?: string }).device_id))
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

    const presenceMap = await loadPresenceDisplayNames(sb, classId, deviceIds);

    const members = (membershipRows ?? [])
      .map((row) => {
        const did = normalizeDeviceId((row as { device_id?: string }).device_id);
        if (!did) return null;

        return buildMemberRow({
          deviceId: did,
          joinedAt: (row as { joined_at?: string | null }).joined_at ?? null,
          profile: profilesRes.profileMap.get(did),
          presenceDisplayName: presenceMap.get(did),
          context: "class/members:membership",
          classId,
        });
      })
      .filter(Boolean);

    return NextResponse.json({
      ok: true,
      source: "class_memberships",
      classId,
      members,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        detail: message,
      },
      { status: 500 }
    );
  }
}
