import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  logDisplayNameResolution,
  pickLatestSessionMemberByDevice,
  resolveDisplayName,
} from "@/lib/resolveDisplayName";
import { auditJoinStateInvariants } from "@/lib/joinStateInvariants";

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
  display_name?: string | null;
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

function buildAvatarPublicUrl(photoPath: string | null | undefined) {
  const normalized = normalizePhotoPath(photoPath);
  if (!normalized) return null;

  const base = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");

  if (!base) return null;

  return `${base}/storage/v1/object/public/profile-photos/${encodeURIComponent(normalized)}?v=${encodeURIComponent(normalized)}`;
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

async function getProfileMap(
  sb: ReturnType<typeof admin>,
  deviceIds: string[]
) {
  if (deviceIds.length === 0) {
    return {
      ok: true as const,
      profileMap: new Map<string, UserProfileRow>(),
    };
  }

  const { data, error } = await sb
    .from("user_profiles")
    .select("device_id,display_name,photo_path")
    .in("device_id", deviceIds);

  if (error) {
    return { ok: false as const, error };
  }

  const map = new Map<string, UserProfileRow>();

  for (const row of (Array.isArray(data) ? data : []) as UserProfileRow[]) {
    const did = String(row.device_id ?? "").trim();
    if (!did) continue;
    map.set(did, row);
  }

  return {
    ok: true as const,
    profileMap: map,
  };
}

async function getPresenceMap(
  sb: ReturnType<typeof admin>,
  deviceIds: string[],
  sessionId: string,
  classId: string
) {
  if (deviceIds.length === 0) {
    return {
      ok: true as const,
      presenceMap: new Map<string, PresenceInfo>(),
    };
  }

  let query = sb
    .from("class_presence")
    .select("device_id,screen,session_id,last_seen_at,class_id")
    .in("device_id", deviceIds)
    .order("last_seen_at", { ascending: false });

  if (classId) {
    query = query.eq("class_id", classId);
  }

  const { data, error } = await query;

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
  profileMap: Map<string, UserProfileRow>,
  presenceMap: Map<string, PresenceInfo>
) {
  const latestByDevice = pickLatestSessionMemberByDevice(rawMembers);

  const members = Array.from(latestByDevice.entries()).map(
    ([deviceId, row]) => {
      const joinedAt =
        String(row.joined_at ?? "").trim() || new Date(0).toISOString();
      const profile = profileMap.get(deviceId);

      const resolved = resolveDisplayName({
        profileDisplayName: profile?.display_name,
        sessionMemberDisplayName: row.display_name,
      });

      logDisplayNameResolution("session/status", deviceId, resolved);

      const presence = presenceMap.get(deviceId) ?? {
        screen: "offline",
        session_id: null,
        last_seen_at: null,
        is_in_call: false,
      };

      const photo_path = normalizePhotoPath(profile?.photo_path);

      return {
        device_id: deviceId,
        display_name: resolved.displayName,
        display_name_source: resolved.source,
        photo_path,
        avatar_url: buildAvatarPublicUrl(photo_path),
        joined_at: joinedAt,
        screen: presence.screen,
        presence_session_id: presence.session_id,
        last_seen_at: presence.last_seen_at,
        is_in_call: presence.is_in_call,
      };
    }
  );

  return members.sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}

function buildMembersFast(
  rawMembers: SessionMemberRow[],
  profileMap: Map<string, UserProfileRow>
) {
  const latestByDevice = pickLatestSessionMemberByDevice(rawMembers);

  const members = Array.from(latestByDevice.entries()).map(
    ([deviceId, row]) => {
      const joinedAt =
        String(row.joined_at ?? "").trim() || new Date(0).toISOString();
      const profile = profileMap.get(deviceId);

      const resolved = resolveDisplayName({
        profileDisplayName: profile?.display_name,
        sessionMemberDisplayName: row.display_name,
      });

      const photo_path = normalizePhotoPath(profile?.photo_path);

      return {
        device_id: deviceId,
        display_name: resolved.displayName,
        display_name_source: resolved.source,
        photo_path,
        avatar_url: buildAvatarPublicUrl(photo_path),
        joined_at: joinedAt,
        screen: null,
        presence_session_id: null,
        last_seen_at: null,
        is_in_call: true,
      };
    }
  );

  return members.sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionIdRaw = (searchParams.get("sessionId") ?? "").trim();
    const classIdRaw = (searchParams.get("classId") ?? "").trim();
    const viewerDeviceId = (
      searchParams.get("viewerDeviceId") ??
      searchParams.get("deviceId") ??
      ""
    ).trim();
    const lite =
      searchParams.get("lite") === "1" ||
      searchParams.get("lite") === "true";
    const fast =
      searchParams.get("fast") === "1" ||
      searchParams.get("fast") === "true";

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

    const perfStart = Date.now();
    let membershipMs = 0;
    let profilesMs = 0;
    let presenceMs = 0;
    let otherMs = 0;

    const sb = admin();

    const membershipStart = Date.now();
    const sessionRes = await getSession(sb, sessionIdRaw);
    if (!sessionRes.ok) {
      const msg = sessionRes.error?.message ?? "session_lookup_failed";
      return NextResponse.json(
        { ok: false, error: msg },
        { status: msg === "session_not_found" ? 404 : 500 }
      );
    }

    const session = sessionRes.session;

    const sessionClassId = String(session.class_id ?? "").trim();

    if (sessionClassId !== classIdRaw) {
      console.warn(
        `[join-state] mismatch sessionClass=${sessionClassId.slice(-6)} ` +
          `requestedClass=${classIdRaw.slice(-6)} session=${sessionIdRaw.slice(-6)}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: "session_class_mismatch",
          sessionClassId,
          requestedClassId: classIdRaw,
        },
        { status: 409 }
      );
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
    membershipMs = Date.now() - membershipStart;

    let members;

    if (fast) {
      const profilesStart = Date.now();
      const profileMapRes = await getProfileMap(sb, deviceIds);
      profilesMs = Date.now() - profilesStart;
      if (!profileMapRes.ok) {
        return NextResponse.json(
          { ok: false, error: profileMapRes.error.message },
          { status: 500 }
        );
      }
      members = buildMembersFast(
        rawMembersRes.members,
        profileMapRes.profileMap
      );
    } else {
      const enrichStart = Date.now();
      const [profileMapRes, presenceMapRes] = await Promise.all([
        getProfileMap(sb, deviceIds),
        getPresenceMap(sb, deviceIds, sessionIdRaw, classIdRaw),
      ]);
      const enrichMs = Date.now() - enrichStart;
      profilesMs = Math.round(enrichMs * 0.45);
      presenceMs = enrichMs - profilesMs;

      if (!profileMapRes.ok) {
        return NextResponse.json(
          { ok: false, error: profileMapRes.error.message },
          { status: 500 }
        );
      }
      if (!presenceMapRes.ok) {
        return NextResponse.json(
          { ok: false, error: presenceMapRes.error.message },
          { status: 500 }
        );
      }

      members = buildMembers(
        rawMembersRes.members,
        profileMapRes.profileMap,
        presenceMapRes.presenceMap
      );
    }

    const inCallCount = members.filter((m) => m.is_in_call === true).length;
    const withPresenceCount = members.filter((m) => m.last_seen_at).length;

    let viewerState:
      | {
          hasClassMembership: boolean;
          inSessionMembers: boolean;
          inMemberList: boolean;
        }
      | undefined;

    if (viewerDeviceId) {
      const viewerStart = Date.now();
      const inMemberList = members.some(
        (m) => String(m.device_id ?? "").trim() === viewerDeviceId
      );

      if (fast || lite) {
        viewerState = {
          hasClassMembership: true,
          inSessionMembers: inMemberList,
          inMemberList,
        };
      } else {
        const { data: membershipRow } = await sb
          .from("class_memberships")
          .select("class_id")
          .eq("class_id", classIdRaw)
          .eq("device_id", viewerDeviceId)
          .maybeSingle();

        const { data: viewerSessionMember } = await sb
          .from("session_members")
          .select("device_id")
          .eq("session_id", sessionIdRaw)
          .eq("device_id", viewerDeviceId)
          .maybeSingle();

        viewerState = {
          hasClassMembership: Boolean(membershipRow),
          inSessionMembers: Boolean(viewerSessionMember),
          inMemberList,
        };

        console.log(
          `[session-status] membership exists=${viewerState.hasClassMembership} ` +
            `viewerInSessionMembers=${viewerState.inSessionMembers} ` +
            `viewerInMemberList=${viewerState.inMemberList} device=${viewerDeviceId.slice(-4)} ` +
            `session=${sessionIdRaw.slice(-6)} class=${classIdRaw.slice(-6)}`
        );

        if (!lite) {
          const auditStart = Date.now();
          await auditJoinStateInvariants(sb, {
            classId: classIdRaw,
            sessionId: sessionIdRaw,
            deviceId: viewerDeviceId,
            sessionClassId,
            requestedClassId: classIdRaw,
          });
          otherMs += Date.now() - auditStart;
        }
      }
      otherMs += Date.now() - viewerStart;
    }

    if (!lite && !fast) {
      const auditAllStart = Date.now();
      for (const deviceId of deviceIds.slice(0, 20)) {
        await auditJoinStateInvariants(sb, {
          classId: classIdRaw,
          sessionId: sessionIdRaw,
          deviceId,
          sessionClassId,
        });
      }
      otherMs += Date.now() - auditAllStart;
    }

    const totalMs = Date.now() - perfStart;
    const messagesMs = 0;
    const unattributed = Math.max(
      0,
      totalMs - membershipMs - profilesMs - presenceMs - messagesMs - otherMs
    );
    otherMs += unattributed;

    console.log(
      `[api-session-status-perf] totalMs=${totalMs} membershipMs=${membershipMs} ` +
        `presenceMs=${presenceMs} profilesMs=${profilesMs} messagesMs=${messagesMs} ` +
        `otherMs=${otherMs} lite=${lite ? 1 : 0} fast=${fast ? 1 : 0} ` +
        `members=${members.length} session=${sessionIdRaw.slice(-6)} class=${classIdRaw.slice(-6)}`
    );

    console.log(
      `[session-status] members count=${members.length} fast=${fast} lite=${lite} ` +
        `ids=${members.map((m) => String(m.device_id ?? "").slice(-4)).join(",")} ` +
        `session=${sessionIdRaw.slice(-6)} class=${classIdRaw.slice(-6)}`
    );
    console.log(
      `[session-status] presence inCall=${inCallCount} withLastSeen=${withPresenceCount} ` +
        `rawSessionRows=${rawMembersRes.members.length}`
    );

    console.log(
      `[session-members] api-result session=${sessionIdRaw.slice(-6)} class=${classIdRaw.slice(-6)} ` +
        `rawRows=${rawMembersRes.members.length} members=${members.length} ` +
        `ids=${members.map((m) => String(m.device_id ?? "").slice(-4)).join(",")}`
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
        viewerState,
        fast,
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