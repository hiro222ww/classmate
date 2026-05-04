import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("missing_supabase_service_role");

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

type SessionRow = {
  id: string;
  class_id?: string | null;
  topic?: string | null;
  status?: string | null;
  capacity?: number | null;
  created_at?: string | null;
};

type SessionMemberRow = {
  device_id?: string | null;
  display_name?: string | null;
  joined_at?: string | null;
};

type UserProfileRow = {
  device_id?: string | null;
  photo_path?: string | null;
};

type PresenceRow = {
  device_id?: string | null;
  screen?: string | null;
  session_id?: string | null;
  last_seen_at?: string | null;
};

type PresenceInfo = {
  screen: string;
  session_id: string | null;
  last_seen_at: string | null;
  is_in_call: boolean;
};

function sanitizeDisplayName(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "You") return "参加者";
  return s;
}

function normalizePhotoPath(v: string | null | undefined) {
  let s = String(v ?? "").trim();
  if (!s) return null;

  if (s.startsWith("profile-photos/")) {
    s = s.replace(/^profile-photos\//, "");
  }

  if (s.startsWith("avatars/")) {
    s = s.replace(/^avatars\//, "");
  }

  return s || null;
}

function isFreshPresence(lastSeenAt: string | null, maxAgeMs = 20_000) {
  if (!lastSeenAt) return false;

  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;

  return Date.now() - t < maxAgeMs;
}

async function getSession(sb: ReturnType<typeof admin>, sessionId: string) {
  const { data, error } = await sb
    .from("sessions")
    .select("id,class_id,topic,status,capacity,created_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, error };
  }

  if (!data) {
    return {
      ok: false as const,
      error: new Error("session_not_found"),
    };
  }

  return {
    ok: true as const,
    session: data as SessionRow,
  };
}

async function getRawMembers(sb: ReturnType<typeof admin>, sessionId: string) {
  const { data, error } = await sb
    .from("session_members")
    .select("device_id,display_name,joined_at")
    .eq("session_id", sessionId)
    .not("device_id", "is", null)
    .neq("device_id", "")
    .order("joined_at", { ascending: true });

  if (error) {
    return { ok: false as const, error };
  }

  return {
    ok: true as const,
    members: (Array.isArray(data) ? data : []) as SessionMemberRow[],
  };
}

async function getPhotoPathMap(
  sb: ReturnType<typeof admin>,
  deviceIds: string[]
) {
  if (deviceIds.length === 0) {
    return {
      ok: true as const,
      photoPathMap: new Map<string, string | null>(),
    };
  }

  const { data, error } = await sb
    .from("user_profiles")
    .select("device_id,photo_path")
    .in("device_id", deviceIds);

  if (error) {
    return { ok: false as const, error };
  }

  const map = new Map<string, string | null>();

  for (const row of (Array.isArray(data) ? data : []) as UserProfileRow[]) {
    const did = String(row.device_id ?? "").trim();
    if (!did) continue;
    map.set(did, normalizePhotoPath(row.photo_path));
  }

  return {
    ok: true as const,
    photoPathMap: map,
  };
}

async function getPresenceMap(
  sb: ReturnType<typeof admin>,
  deviceIds: string[],
  sessionId: string
) {
  if (deviceIds.length === 0) {
    return {
      ok: true as const,
      presenceMap: new Map<string, PresenceInfo>(),
    };
  }

  const { data, error } = await sb
    .from("class_presence")
    .select("device_id,screen,session_id,last_seen_at")
    .in("device_id", deviceIds)
    .order("last_seen_at", { ascending: false });

  if (error) {
    return { ok: false as const, error };
  }

  const map = new Map<string, PresenceInfo>();

  for (const row of (Array.isArray(data) ? data : []) as PresenceRow[]) {
    const did = String(row.device_id ?? "").trim();
    if (!did) continue;

    if (map.has(did)) continue;

    const screen = String(row.screen ?? "").trim() || "offline";
    const rowSessionId = String(row.session_id ?? "").trim() || null;
    const lastSeenAt = String(row.last_seen_at ?? "").trim() || null;

    const fresh = isFreshPresence(lastSeenAt);
    const isInCall =
      fresh && screen === "call" && rowSessionId === sessionId;

    map.set(did, {
      screen: fresh ? screen : "offline",
      session_id: fresh ? rowSessionId : null,
      last_seen_at: lastSeenAt,
      is_in_call: isInCall,
    });
  }

  return {
    ok: true as const,
    presenceMap: map,
  };
}

function buildMembers(
  rawMembers: SessionMemberRow[],
  photoPathMap: Map<string, string | null>,
  presenceMap: Map<string, PresenceInfo>
) {
  const byDevice = new Map<
    string,
    {
      device_id: string;
      display_name: string;
      photo_path: string | null;
      avatar_url: null;
      joined_at: string;
      screen: string;
      presence_session_id: string | null;
      last_seen_at: string | null;
      is_in_call: boolean;
    }
  >();

  for (const row of rawMembers) {
    const deviceId = String(row.device_id ?? "").trim();
    if (!deviceId) continue;

    const displayName = sanitizeDisplayName(row.display_name);
    const joinedAt =
      String(row.joined_at ?? "").trim() || new Date(0).toISOString();

    const presence = presenceMap.get(deviceId) ?? {
      screen: "offline",
      session_id: null,
      last_seen_at: null,
      is_in_call: false,
    };

    const prev = byDevice.get(deviceId);
    if (prev && prev.joined_at <= joinedAt) continue;

    byDevice.set(deviceId, {
      device_id: deviceId,
      display_name: displayName,
      photo_path: photoPathMap.get(deviceId) ?? null,
      avatar_url: null,
      joined_at: joinedAt,
      screen: presence.screen,
      presence_session_id: presence.session_id,
      last_seen_at: presence.last_seen_at,
      is_in_call: presence.is_in_call,
    });
  }

  return Array.from(byDevice.values()).sort((a, b) =>
    a.joined_at.localeCompare(b.joined_at)
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionIdRaw = (searchParams.get("sessionId") ?? "").trim();
    const classIdRaw = (searchParams.get("classId") ?? "").trim();

    if (!sessionIdRaw) {
      return NextResponse.json(
        { ok: false, error: "missing_sessionId" },
        { status: 400 }
      );
    }

    if (!classIdRaw) {
      return NextResponse.json(
        { ok: false, error: "missing_classId" },
        { status: 400 }
      );
    }

    if (!isUuid(sessionIdRaw)) {
      return NextResponse.json(
        {
          ok: false,
          error: `invalid_sessionId (uuid required): ${sessionIdRaw}`,
        },
        { status: 400 }
      );
    }

    if (!isUuid(classIdRaw)) {
      return NextResponse.json(
        {
          ok: false,
          error: `invalid_classId (uuid required): ${classIdRaw}`,
        },
        { status: 400 }
      );
    }

    const sb = admin();

    const sessionRes = await getSession(sb, sessionIdRaw);
    if (!sessionRes.ok) {
      const msg = sessionRes.error?.message ?? "session_lookup_failed";
      return NextResponse.json(
        { ok: false, error: msg },
        { status: msg === "session_not_found" ? 404 : 500 }
      );
    }

    const session = sessionRes.session;

    if (String(session.class_id ?? "").trim() !== classIdRaw) {
      console.warn("[session/status] class mismatch", {
        sessionIdRaw,
        classIdRaw,
        sessionClassId: String(session.class_id ?? "").trim(),
      });
    }

    const rawMembersRes = await getRawMembers(sb, sessionIdRaw);
    if (!rawMembersRes.ok) {
      return NextResponse.json(
        { ok: false, error: rawMembersRes.error.message },
        { status: 500 }
      );
    }

    const deviceIds = Array.from(
      new Set(
        rawMembersRes.members
          .map((row) => String(row.device_id ?? "").trim())
          .filter(Boolean)
      )
    );

    const photoMapRes = await getPhotoPathMap(sb, deviceIds);
    if (!photoMapRes.ok) {
      return NextResponse.json(
        { ok: false, error: photoMapRes.error.message },
        { status: 500 }
      );
    }

    const presenceMapRes = await getPresenceMap(sb, deviceIds, sessionIdRaw);
    if (!presenceMapRes.ok) {
      return NextResponse.json(
        { ok: false, error: presenceMapRes.error.message },
        { status: 500 }
      );
    }

    const members = buildMembers(
      rawMembersRes.members,
      photoMapRes.photoPathMap,
      presenceMapRes.presenceMap
    );

    return NextResponse.json(
      {
        ok: true,
        session: {
          id: String(session.id),
          class_id: String(session.class_id ?? ""),
          topic: String(session.topic ?? "").trim(),
          status: String(session.status ?? "forming"),
          capacity: Number(session.capacity ?? 5),
          created_at: session.created_at ?? null,
        },
        members,
        memberCount: members.length,
        inCallMemberCount: members.filter((m) => m.is_in_call).length,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "status_failed" },
      { status: 500 }
    );
  }
}