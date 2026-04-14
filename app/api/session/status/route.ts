import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  return createClient(url, key, { auth: { persistSession: false } });
}

export const dynamic = "force-dynamic";

const AUTO_ACTIVE_MEMBER_COUNT = 3;
const FORMING_TIMEOUT_MS = 5 * 60 * 1000;

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

async function createAvatarUrl(
  sb: ReturnType<typeof admin>,
  photoPath: string | null
) {
  const normalized = normalizePhotoPath(photoPath);
  if (!normalized) return null;

  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  ) {
    return normalized;
  }

  const { data, error } = await sb.storage
    .from("profile-photos")
    .createSignedUrl(normalized, 60 * 60);

  if (error) {
    console.warn("[session/status] avatar signed url failed", {
      photoPath,
      normalized,
      message: error.message,
    });
    return null;
  }

  const signedUrl = String(data?.signedUrl ?? "").trim();
  return signedUrl || null;
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

    const s = await sb
      .from("sessions")
      .select("id, class_id, topic, status, capacity, created_at")
      .eq("id", sessionIdRaw)
      .maybeSingle();

    if (s.error) {
      return NextResponse.json(
        { ok: false, error: s.error.message },
        { status: 500 }
      );
    }

    if (!s.data) {
      return NextResponse.json(
        { ok: false, error: "session_not_found" },
        { status: 404 }
      );
    }

    if (String(s.data.class_id ?? "").trim() !== classIdRaw) {
      console.warn("[session/status] class mismatch", {
        sessionIdRaw,
        classIdRaw,
        sessionClassId: String(s.data.class_id ?? "").trim(),
      });
    }

    const m = await sb
      .from("session_members")
      .select("device_id, display_name, joined_at")
      .eq("session_id", sessionIdRaw)
      .not("device_id", "is", null)
      .neq("device_id", "")
      .order("joined_at", { ascending: true });

    if (m.error) {
      return NextResponse.json(
        { ok: false, error: m.error.message },
        { status: 500 }
      );
    }

    const rawMembers = (Array.isArray(m.data) ? m.data : []) as SessionMemberRow[];

    const deviceIds = Array.from(
      new Set(
        rawMembers
          .map((row) => String(row.device_id ?? "").trim())
          .filter(Boolean)
      )
    );

    if (deviceIds.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    let profileMap = new Map<
      string,
      { display_name: string; photo_path: string | null; avatar_url: string | null }
    >();

    if (deviceIds.length > 0) {
      const p = await sb
        .from("user_profiles")
        .select("device_id, display_name, photo_path")
        .in("device_id", deviceIds);

      if (p.error) {
        return NextResponse.json(
          { ok: false, error: p.error.message },
          { status: 500 }
        );
      }

      const rawProfiles = (Array.isArray(p.data) ? p.data : []) as UserProfileRow[];

      const profileEntries = await Promise.all(
        rawProfiles.map(async (row) => {
          const deviceId = String(row.device_id ?? "").trim();
          if (!deviceId) return null;

          const photoPath = normalizePhotoPath(row.photo_path);
          const avatarUrl = await createAvatarUrl(sb, photoPath);

          return [
            deviceId,
            {
              display_name: sanitizeDisplayName(row.display_name),
              photo_path: photoPath,
              avatar_url: avatarUrl,
            },
          ] as const;
        })
      );

      profileMap = new Map(
        profileEntries.filter(
          (
            entry
          ): entry is readonly [
            string,
            {
              display_name: string;
              photo_path: string | null;
              avatar_url: string | null;
            }
          ] => !!entry
        )
      );
    }

    const byDevice = new Map<
      string,
      {
        device_id: string;
        display_name: string;
        photo_path: string | null;
        avatar_url: string | null;
        joined_at: string;
      }
    >();

    for (const row of rawMembers) {
      const deviceId = String(row.device_id ?? "").trim();
      if (!deviceId) continue;

      const profile = profileMap.get(deviceId);

      const displayName = profile?.display_name
        ? sanitizeDisplayName(profile.display_name)
        : sanitizeDisplayName(row.display_name);

      const photoPath = normalizePhotoPath(profile?.photo_path ?? null);
      const avatarUrl = profile?.avatar_url ?? null;
      const joinedAt =
        String(row.joined_at ?? "").trim() || new Date(0).toISOString();

      const prev = byDevice.get(deviceId);

      if (!prev || joinedAt < prev.joined_at) {
        byDevice.set(deviceId, {
          device_id: deviceId,
          display_name: displayName,
          photo_path: photoPath,
          avatar_url: avatarUrl,
          joined_at: joinedAt,
        });
      }
    }

    const members = Array.from(byDevice.values()).sort((a, b) =>
      a.joined_at.localeCompare(b.joined_at)
    );

    const memberCount = members.length;
    let resolvedStatus = String(s.data.status ?? "forming");

    if (resolvedStatus === "forming") {
      const createdAtMs = s.data.created_at
        ? new Date(s.data.created_at).getTime()
        : 0;
      const nowMs = Date.now();

      const shouldActivate =
        memberCount >= AUTO_ACTIVE_MEMBER_COUNT ||
        (createdAtMs > 0 && nowMs - createdAtMs >= FORMING_TIMEOUT_MS);

      if (shouldActivate) {
        const updateRes = await sb
          .from("sessions")
          .update({ status: "active" })
          .eq("id", sessionIdRaw)
          .eq("status", "forming");

        if (updateRes.error) {
          console.warn("[session/status] activate failed", {
            sessionIdRaw,
            message: updateRes.error.message,
          });
        } else {
          resolvedStatus = "active";
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        session: {
          id: String(s.data.id),
          class_id: String(s.data.class_id ?? ""),
          topic: String(s.data.topic ?? "").trim(),
          status: resolvedStatus,
          capacity: Number(s.data.capacity ?? 5),
          created_at: s.data.created_at ?? null,
        },
        members,
        memberCount,
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