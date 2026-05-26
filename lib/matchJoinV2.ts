import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatPostgresError, postgresErrorBody } from "@/lib/postgresError";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeTopicKey(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "free") return null;
  return s;
}

function normalizeCapacity(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 5;
  return Math.max(2, Math.min(5, Math.floor(n)));
}

function normalizeAge(v: unknown, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function calcAgeFromBirthDate(birthDate: string | null | undefined) {
  const s = String(birthDate ?? "").trim();
  if (!s) return null;

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();

  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function isDeadlinePassed(matchDeadlineAt?: string | null) {
  if (!matchDeadlineAt) return false;

  const deadline = new Date(matchDeadlineAt).getTime();
  if (!Number.isFinite(deadline)) return false;

  return Date.now() > deadline;
}

function deadlineError(matchDeadlineAt?: string | null) {
  return NextResponse.json(
    {
      ok: false,
      error: "match_deadline_passed",
      matchDeadlineAt: matchDeadlineAt ?? null,
      message: "このマッチングは締め切られました",
    },
    { status: 400 }
  );
}

type ProfileRow = {
  device_id: string;
  display_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  photo_path?: string | null;
};

type SessionRow = {
  id: string;
  status?: string | null;
  created_at?: string | null;
  capacity?: number | null;
};

type DbError = {
  message: string;
  code?: string;
  hint?: string;
  details?: string;
};

type ClassDeadlineRow = {
  id: string;
  name?: string | null;
  world_key?: string | null;
  topic_key?: string | null;
  match_deadline_at?: string | null;
};

type TopicDeadlineRow = {
  topic_key?: string | null;
  match_deadline_at?: string | null;
};

type TopicGenderRestrictionRow = {
  topic_key?: string | null;
  gender_restriction?: string | null;
};

type RunAtomicMatchParams = {
  worldKey: string;
  topicKey: string | null;
  requestedCapacity: number;
  requestedMinAge: number;
  requestedMaxAge: number;
  deviceId: string;
  joinDisplayName: string;
  blockedDeviceIds: string[];
};

function resolveJoinDisplayName(profile: ProfileRow) {
  return String(profile.display_name ?? "").trim() || "参加者";
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function upsertSessionMember(params: {
  sessionId: string;
  deviceId: string;
  joinDisplayName: string;
}) {
  const joinedAt = new Date().toISOString();
  const row = {
    session_id: params.sessionId,
    device_id: params.deviceId,
    display_name: params.joinDisplayName,
    joined_at: joinedAt,
    is_in_call: false,
  };

  const { error } = await supabase.from("session_members").upsert(row, {
    onConflict: "session_id,device_id",
  });

  if (error) {
    console.error("[match-join-v2] session_member_upsert_failed", {
      sessionId: params.sessionId,
      deviceId: params.deviceId,
      joinDisplayName: params.joinDisplayName,
      row,
      ...formatPostgresError(error),
    });

    return {
      ok: false as const,
      response: NextResponse.json(
        postgresErrorBody("session_member_upsert_failed", error, {
          sessionId: params.sessionId,
          deviceId: params.deviceId,
        }),
        { status: 500 }
      ),
    };
  }

  return { ok: true as const };
}

async function getBlockedDeviceIds(deviceId: string) {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_device_id")
    .eq("blocker_device_id", deviceId);

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "blocked_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    ids: (data ?? [])
      .map((x) => String(x.blocked_device_id ?? "").trim())
      .filter(Boolean),
  };
}

async function sessionHasBlockedMember(
  sessionId: string,
  blockedDeviceIds: string[]
) {
  if (blockedDeviceIds.length === 0) {
    return {
      ok: true as const,
      hasBlocked: false,
    };
  }

  const { data, error } = await supabase
    .from("session_members")
    .select("device_id")
    .eq("session_id", sessionId)
    .in("device_id", blockedDeviceIds)
    .limit(1);

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "blocked_session_check_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    hasBlocked: (data ?? []).length > 0,
  };
}

async function getProfile(deviceId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("device_id,display_name,birth_date,gender")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "profile_lookup_failed", detail: error.message },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "profile_required" },
        { status: 400 }
      ),
    };
  }

  return { ok: true as const, profile: data as ProfileRow };
}

async function getClassSlots(deviceId: string) {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("class_slots")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "entitlements_lookup_failed", detail: error.message },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    classSlots: Math.max(1, Number(data?.class_slots ?? 1)),
  };
}

async function getAllMembershipIds(deviceId: string) {
  const { data, error } = await supabase
    .from("class_memberships")
    .select("class_id")
    .eq("device_id", deviceId);

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "memberships_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  const ids = (data ?? [])
    .map((x) => String(x.class_id ?? "").trim())
    .filter(Boolean);

  return {
    ok: true as const,
    ids,
  };
}

async function getMatchPrefs(deviceId: string) {
  const { data, error } = await supabase
    .from("user_match_prefs")
    .select("min_age,max_age")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "match_prefs_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    minAge: Number(data?.min_age ?? 0),
    maxAge: Number(data?.max_age ?? 120),
  };
}

async function ensureMembership(params: {
  deviceId: string;
  classId: string;
  classSlots: number;
}) {
  const { deviceId, classId, classSlots } = params;

  const { data: memberships, error } = await supabase
    .from("class_memberships")
    .select("class_id")
    .eq("device_id", deviceId);

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "memberships_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  const ids = (memberships ?? [])
    .map((x) => String(x.class_id ?? "").trim())
    .filter(Boolean);

  if (ids.includes(classId)) {
    return {
      ok: true as const,
      alreadyJoined: true,
      currentCount: ids.length,
    };
  }

  if (ids.length >= classSlots) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: ids.length,
          classSlots,
        },
        { status: 400 }
      ),
    };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("class_memberships")
    .upsert(
      {
        device_id: deviceId,
        class_id: classId,
      },
      {
        onConflict: "device_id,class_id",
        ignoreDuplicates: true,
      }
    )
    .select("device_id,class_id");

  if (insErr) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "membership_upsert_failed",
          detail: insErr.message,
          code: (insErr as DbError).code ?? null,
          hint: (insErr as DbError).hint ?? null,
          details: (insErr as DbError).details ?? null,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    alreadyJoined: false,
    inserted: inserted ?? [],
    currentCount: ids.length + 1,
  };
}

async function getForcedClassWithDeadline(classId: string) {
  const { data, error } = await supabase
    .from("classes")
    .select("id,name,world_key,topic_key,match_deadline_at")
    .eq("id", classId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "forced_class_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "forced_class_not_found",
          classId,
        },
        { status: 404 }
      ),
    };
  }

  return {
    ok: true as const,
    row: data as ClassDeadlineRow,
  };
}

async function hasMembership(deviceId: string, classId: string) {
  const { data, error } = await supabase
    .from("class_memberships")
    .select("class_id")
    .eq("device_id", deviceId)
    .eq("class_id", classId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "membership_check_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    isMember: Boolean(data),
  };
}

async function getTopicDeadline(params: {
  worldKey: string;
  topicKey: string | null;
}) {
  const { topicKey } = params;

  if (!topicKey) {
    return {
      ok: true as const,
      row: null,
    };
  }

  const { data, error } = await supabase
    .from("topics")
    .select("topic_key,match_deadline_at")
    .eq("topic_key", topicKey)
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "topic_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    row: (data as TopicDeadlineRow | null) ?? null,
  };
}

async function getTopicGenderRestriction(topicKey: string | null) {
  if (!topicKey) {
    return {
      ok: true as const,
      row: null,
    };
  }

  const { data, error } = await supabase
    .from("topics")
    .select("topic_key,gender_restriction")
    .eq("topic_key", topicKey)
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "topic_gender_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    row: (data as TopicGenderRestrictionRow | null) ?? null,
  };
}

function checkGenderRestriction(params: {
  topic: TopicGenderRestrictionRow | null;
  profile: ProfileRow;
}) {
  const genderRestriction = String(
    params.topic?.gender_restriction ?? ""
  ).trim();

  if (!genderRestriction || genderRestriction === "none") {
    return null;
  }

  const profileGender = String(params.profile.gender ?? "").trim();

  if (genderRestriction !== profileGender) {
    return NextResponse.json(
      {
        ok: false,
        error: "gender_restricted_topic",
        genderRestriction,
        profileGender: profileGender || null,
        message: "このテーマは登録した性別では参加できません",
      },
      { status: 403 }
    );
  }

  return null;
}

async function getClassDeadlineById(classId: string) {
  const { data, error } = await supabase
    .from("classes")
    .select("id,name,world_key,topic_key,match_deadline_at")
    .eq("id", classId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "matched_class_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "matched_class_not_found",
          classId,
        },
        { status: 404 }
      ),
    };
  }

  return {
    ok: true as const,
    row: data as ClassDeadlineRow,
  };
}

async function runAtomicMatch(params: RunAtomicMatchParams) {
  const {
    worldKey,
    topicKey,
    requestedCapacity,
    deviceId,
    joinDisplayName,
    blockedDeviceIds,
  } = params;

  let classQuery = supabase
    .from("classes")
    .select("id,name,world_key,topic_key")
    .eq("world_key", worldKey)
    .order("created_at", { ascending: true })
    .limit(1);

  if (topicKey) {
    classQuery = classQuery.eq("topic_key", topicKey);
  } else {
    classQuery = classQuery.is("topic_key", null);
  }

  const { data: classRow, error: classErr } = await classQuery.maybeSingle();

  if (classErr) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "class_lookup_failed", detail: classErr.message },
        { status: 500 }
      ),
    };
  }

  if (!classRow?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "class_not_found", worldKey, topicKey },
        { status: 404 }
      ),
    };
  }

  const classId = String(classRow.id);
  const className = String(classRow.name ?? "").trim() || "クラス";

  const { data: sessions, error: sessionsErr } = await supabase
    .from("sessions")
    .select("id,status,created_at,capacity")
    .eq("class_id", classId)
    .in("status", ["forming", "waiting", "active"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (sessionsErr) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "session_lookup_failed", detail: sessionsErr.message },
        { status: 500 }
      ),
    };
  }

  let chosenSession: SessionRow | null = null;

  for (const s of sessions ?? []) {
    const blockedCheck = await sessionHasBlockedMember(
      String(s.id),
      blockedDeviceIds
    );

    if (!blockedCheck.ok) {
      return {
        ok: false as const,
        response: blockedCheck.response,
      };
    }
    if (blockedCheck.hasBlocked) continue;

    const { count, error: countErr } = await supabase
      .from("session_members")
      .select("device_id", { count: "exact", head: true })
      .eq("session_id", String(s.id));

    if (countErr) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            ok: false,
            error: "session_member_count_failed",
            detail: countErr.message,
          },
          { status: 500 }
        ),
      };
    }

    const capacity = Number(s.capacity ?? requestedCapacity);

    if ((count ?? 0) < capacity) {
      chosenSession = s as SessionRow;
      break;
    }
  }

  if (!chosenSession) {
    const { data: created, error: createErr } = await supabase
      .from("sessions")
      .insert({
        class_id: classId,
        topic: className,
        status: "forming",
        capacity: requestedCapacity,
      })
      .select("id,status,created_at,capacity")
      .single();

    if (createErr) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { ok: false, error: "session_create_failed", detail: createErr.message },
          { status: 500 }
        ),
      };
    }

    chosenSession = created;
  }

  const sessionId = String(chosenSession.id);

  const { error: membershipErr } = await supabase
    .from("class_memberships")
    .upsert(
      {
        device_id: deviceId,
        class_id: classId,
      },
      {
        onConflict: "device_id,class_id",
        ignoreDuplicates: true,
      }
    );

  if (membershipErr) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "membership_upsert_failed",
          detail: membershipErr.message,
        },
        { status: 500 }
      ),
    };
  }

  const memberRes = await upsertSessionMember({
    sessionId,
    deviceId,
    joinDisplayName,
  });
  if (!memberRes.ok) return memberRes;

  return {
    ok: true as const,
    row: {
      class_id: classId,
      class_name: className,
      session_id: sessionId,
      session_status: String(chosenSession.status ?? "forming"),
      session_created_at: chosenSession.created_at ?? null,
      reused: true,
    },
  };
}

export async function matchJoinV2Post(req: Request) {
  try {
    const admissionUrl = new URL("/api/admission/status", req.url);

    const admissionRes = await fetch(admissionUrl, {
      cache: "no-store",
    });

    const admission = await admissionRes.json().catch(() => null);

    if (!admissionRes.ok || !admission?.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "admission_status_failed",
          admission,
        },
        { status: 500 }
      );
    }

    if (!admission.open) {
      return NextResponse.json(
        {
          ok: false,
          error: "admission_closed",
          admission,
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const deviceId = String(body.deviceId ?? "").trim();
    const worldKey = String(body.worldKey ?? "default").trim() || "default";
    const topicKey = normalizeTopicKey(body.topicKey);
    const requestedCapacity = normalizeCapacity(body.capacity);
    const forcedClassId = String(body.classId ?? "").trim();

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    const blockedRes = await getBlockedDeviceIds(deviceId);
    if (!blockedRes.ok) return blockedRes.response;
    const blockedDeviceIds = blockedRes.ids;

    const prefsRes = await getMatchPrefs(deviceId);
    if (!prefsRes.ok) return prefsRes.response;

    const fallbackMinAge = normalizeAge(prefsRes.minAge, 0);
    const fallbackMaxAge = normalizeAge(prefsRes.maxAge, 120);

    const rawMinAge = normalizeAge(body.minAge, fallbackMinAge);
    const rawMaxAge = normalizeAge(body.maxAge, fallbackMaxAge);
    const requestedMinAge = Math.min(rawMinAge, rawMaxAge);
    const requestedMaxAge = Math.max(rawMinAge, rawMaxAge);

    const profileRes = await getProfile(deviceId);
    if (!profileRes.ok) return profileRes.response;

    const selfProfile = profileRes.profile;
    const joinDisplayName = resolveJoinDisplayName(selfProfile);
    const selfAge = calcAgeFromBirthDate(selfProfile.birth_date);

    const slotsRes = await getClassSlots(deviceId);
    if (!slotsRes.ok) return slotsRes.response;
    const classSlots = slotsRes.classSlots;

    const allMembershipsRes = await getAllMembershipIds(deviceId);
    if (!allMembershipsRes.ok) return allMembershipsRes.response;
    const allMembershipIdsBefore = allMembershipsRes.ids;

    if (!forcedClassId && allMembershipIdsBefore.length >= classSlots) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: allMembershipIdsBefore.length,
          classSlots,
        },
        { status: 400 }
      );
    }

    let classId = "";
    let className = "";
    let sessionId = "";
    let sessionStatus = "forming";
    let sessionCreatedAt: string | null = null;
    let reused = false;
    let alreadyJoined = false;
    let currentCount = allMembershipIdsBefore.length;

    if (forcedClassId) {
      const forcedRes = await getForcedClassWithDeadline(forcedClassId);
      if (!forcedRes.ok) return forcedRes.response;

      const existingClass = forcedRes.row;

      const topicGenderRes = await getTopicGenderRestriction(
        existingClass.topic_key ?? null
      );
      if (!topicGenderRes.ok) return topicGenderRes.response;

      const genderBlocked = checkGenderRestriction({
        topic: topicGenderRes.row,
        profile: selfProfile,
      });
      if (genderBlocked) return genderBlocked;

      const membershipCheck = await hasMembership(deviceId, forcedClassId);
      if (!membershipCheck.ok) return membershipCheck.response;

      const isExistingMember = membershipCheck.isMember;

      if (
        !isExistingMember &&
        isDeadlinePassed(existingClass.match_deadline_at ?? null)
      ) {
        return deadlineError(existingClass.match_deadline_at ?? null);
      }

      classId = String(existingClass.id);
      className = String(existingClass.name ?? "").trim() || "クラス";

      const membershipRes = await ensureMembership({
        deviceId,
        classId,
        classSlots,
      });
      if (!membershipRes.ok) return membershipRes.response;

      alreadyJoined = membershipRes.alreadyJoined;
      currentCount = membershipRes.currentCount;

      const { data: existingSessions, error: sessionErr } = await supabase
        .from("sessions")
        .select("id,status,created_at,capacity")
        .eq("class_id", classId)
        .in("status", ["forming", "waiting", "active"])
        .order("created_at", { ascending: true })
        .limit(10);

      if (sessionErr) {
        return NextResponse.json(
          {
            ok: false,
            error: "forced_session_lookup_failed",
            detail: sessionErr.message,
          },
          { status: 500 }
        );
      }

      let chosenSession: SessionRow | null = null;

      for (const s of existingSessions ?? []) {
        const check = await sessionHasBlockedMember(
          String(s.id),
          blockedDeviceIds
        );
        if (!check.ok) return check.response;

        if (!check.hasBlocked) {
          chosenSession = s as SessionRow;
          break;
        }
      }

      if (chosenSession?.id) {
        sessionId = String(chosenSession.id);
        sessionStatus = String(chosenSession.status ?? "forming");
        sessionCreatedAt = chosenSession.created_at ?? null;
        reused = true;
      } else {
        const { data: createdSession, error: createSessionErr } = await supabase
          .from("sessions")
          .insert({
            class_id: classId,
            topic: className,
            status: "forming",
            capacity: requestedCapacity,
          })
          .select("id,status,created_at")
          .single();

        if (createSessionErr) {
          return NextResponse.json(
            {
              ok: false,
              error: "forced_session_create_failed",
              detail: createSessionErr.message,
            },
            { status: 500 }
          );
        }

        sessionId = String(createdSession.id);
        sessionStatus = String(createdSession.status ?? "forming");
        sessionCreatedAt = createdSession.created_at ?? null;
        reused = false;
      }

      const forcedMemberRes = await upsertSessionMember({
        sessionId,
        deviceId,
        joinDisplayName,
      });
      if (!forcedMemberRes.ok) return forcedMemberRes.response;
    } else {
      const topicGenderRes = await getTopicGenderRestriction(topicKey);
      if (!topicGenderRes.ok) return topicGenderRes.response;

      const genderBlocked = checkGenderRestriction({
        topic: topicGenderRes.row,
        profile: selfProfile,
      });
      if (genderBlocked) return genderBlocked;

      const topicRes = await getTopicDeadline({ worldKey, topicKey });
      if (!topicRes.ok) return topicRes.response;

      if (
        topicRes.row?.match_deadline_at &&
        isDeadlinePassed(topicRes.row.match_deadline_at)
      ) {
        return deadlineError(topicRes.row.match_deadline_at);
      }

      const atomicRes = await runAtomicMatch({
        worldKey,
        topicKey,
        requestedCapacity,
        requestedMinAge,
        requestedMaxAge,
        deviceId,
        joinDisplayName,
        blockedDeviceIds,
      });
      if (!atomicRes.ok) return atomicRes.response;

      classId = String(atomicRes.row.class_id);
      className = String(atomicRes.row.class_name ?? "").trim() || "クラス";
      sessionId = String(atomicRes.row.session_id);
      sessionStatus = String(atomicRes.row.session_status ?? "forming");
      sessionCreatedAt = atomicRes.row.session_created_at ?? null;
      reused = Boolean(atomicRes.row.reused);

      const matchedClassRes = await getClassDeadlineById(classId);
      if (!matchedClassRes.ok) return matchedClassRes.response;

      if (isDeadlinePassed(matchedClassRes.row.match_deadline_at ?? null)) {
        return deadlineError(matchedClassRes.row.match_deadline_at ?? null);
      }

      const afterMembershipsRes = await getAllMembershipIds(deviceId);
      if (afterMembershipsRes.ok) {
        currentCount = afterMembershipsRes.ids.length;
        alreadyJoined = allMembershipIdsBefore.includes(classId);
      } else {
        currentCount = allMembershipIdsBefore.includes(classId)
          ? allMembershipIdsBefore.length
          : allMembershipIdsBefore.length + 1;
        alreadyJoined = allMembershipIdsBefore.includes(classId);
      }
    }

    return NextResponse.json({
      ok: true,
      classId,
      className,
      sessionId,
      sessionStatus,
      sessionCreatedAt,
      requestedCapacity,
      requestedMinAge,
      requestedMaxAge,
      selfAge,
      alreadyJoined,
      reused,
      currentCount,
      classSlots,
      blockedDeviceCount: blockedDeviceIds.length,
    });
  } catch (e: unknown) {
    console.error("[class/match-join] server error =", e);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        detail: errorDetail(e),
      },
      { status: 500 }
    );
  }
}
