import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatPostgresError } from "@/lib/postgresError";
import { callMatchJoinAtomicV3 } from "@/lib/matchJoinAtomicV3";
import {
  blocksNewJoinSessionStatus,
  isDeadlinePassed,
  isRecruitingSessionStatus,
  isSessionEligibleForNormalJoin,
} from "@/lib/recruitment";
import { getRecruitmentSessionTtlMinutes, getRecruitmentSessionTtlSetting } from "@/lib/recruitmentSettings";
import {
  GENDER_RESTRICTED_TOPIC_MESSAGE,
  genderRestrictionBlocksJoin,
} from "@/lib/genderRestriction";
import { getBillableMembershipSnapshot } from "@/lib/classMembershipSlots";

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

function resolveJoinDisplayName(profile: ProfileRow) {
  return String(profile.display_name ?? "").trim() || "参加者";
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
          ...formatPostgresError(error),
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
        {
          ok: false,
          error: "profile_lookup_failed",
          ...formatPostgresError(error),
        },
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
        {
          ok: false,
          error: "entitlements_lookup_failed",
          ...formatPostgresError(error),
        },
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
          ...formatPostgresError(error),
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
          ...formatPostgresError(error),
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
          ...formatPostgresError(error),
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
          ...formatPostgresError(error),
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

async function userHasClassInTopic(params: {
  deviceId: string;
  worldKey: string;
  topicKey: string | null;
}) {
  const membershipRes = await getAllMembershipIds(params.deviceId);
  if (!membershipRes.ok) {
    return { ok: false as const, response: membershipRes.response };
  }

  if (membershipRes.ids.length === 0) {
    return { ok: true as const, isMember: false };
  }

  let query = supabase
    .from("classes")
    .select("id")
    .in("id", membershipRes.ids)
    .eq("world_key", params.worldKey)
    .limit(1);

  if (params.topicKey) {
    query = query.eq("topic_key", params.topicKey);
  } else {
    query = query.is("topic_key", null);
  }

  const { data, error } = await query;

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "topic_membership_lookup_failed",
          ...formatPostgresError(error),
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    isMember: (data ?? []).length > 0,
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
          ...formatPostgresError(error),
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
          ...formatPostgresError(error),
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
  if (
    genderRestrictionBlocksJoin({
      genderRestriction: params.topic?.gender_restriction,
      profileGender: params.profile.gender,
    })
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "gender_restricted_topic",
        genderRestriction:
          String(params.topic?.gender_restriction ?? "").trim() || null,
        profileGender: String(params.profile.gender ?? "").trim() || null,
        message: GENDER_RESTRICTED_TOPIC_MESSAGE,
      },
      { status: 403 }
    );
  }

  return null;
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
      console.warn("[class/match-join-v2] admission_closed", {
        admissionWindowEnabled: admission.admissionWindowEnabled,
        current: admission.current,
        window: admission.window,
      });

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
    const requestId = randomUUID();
    const deviceId = String(body.deviceId ?? "").trim();
    const worldKey = String(body.worldKey ?? "default").trim() || "default";
    const topicKey = normalizeTopicKey(body.topicKey);
    const requestedCapacity = normalizeCapacity(body.capacity);
    const openJoinedClass = body.openJoinedClass === true;
    const rawClassId = String(
      body.classId ?? body.forcedClassId ?? ""
    ).trim();
    const forcedClassId = openJoinedClass ? rawClassId : "";

    if (!openJoinedClass && rawClassId) {
      console.warn("[class/match-join-v2] ignored classId without openJoinedClass", {
        rawClassId,
      });
    }

    if (openJoinedClass && !forcedClassId) {
      return NextResponse.json(
        { ok: false, error: "open_joined_class_id_missing" },
        { status: 400 }
      );
    }

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

    console.log("[class/match-join-v2] request", {
      requestId,
      deviceId,
      worldKey,
      topicKey,
      minAge: requestedMinAge,
      maxAge: requestedMaxAge,
      capacity: requestedCapacity,
      openJoinedClass,
      forcedClassId: forcedClassId || null,
      rawClassId: rawClassId || null,
    });

    const profileRes = await getProfile(deviceId);
    if (!profileRes.ok) return profileRes.response;

    const selfProfile = profileRes.profile;
    const joinDisplayName = resolveJoinDisplayName(selfProfile);
    const selfAge = calcAgeFromBirthDate(selfProfile.birth_date);

    const slotsRes = await getClassSlots(deviceId);
    if (!slotsRes.ok) return slotsRes.response;
    const classSlots = slotsRes.classSlots;

    const billableRes = await getBillableMembershipSnapshot(supabase, deviceId);
    if (!billableRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "memberships_lookup_failed",
          detail: billableRes.error,
        },
        { status: 500 }
      );
    }

    const membershipSnapshot = billableRes.snapshot;
    const allMembershipIdsBefore = membershipSnapshot.billableClassIds;

    if (!forcedClassId && membershipSnapshot.billableCount >= classSlots) {
      console.warn("[class/match-join-v2] class_slots_limit", {
        deviceId,
        classSlots,
        billableCount: membershipSnapshot.billableCount,
        totalMembershipCount: membershipSnapshot.totalCount,
        legacyMembershipCount: membershipSnapshot.legacyCount,
        billableClassIds: membershipSnapshot.billableClassIds,
        legacyClassIds: membershipSnapshot.legacyClassIds,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: membershipSnapshot.billableCount,
          totalMembershipCount: membershipSnapshot.totalCount,
          legacyMembershipCount: membershipSnapshot.legacyCount,
          classSlots,
        },
        { status: 400 }
      );
    }

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

      if (
        !membershipCheck.isMember &&
        isDeadlinePassed(existingClass.match_deadline_at ?? null)
      ) {
        return deadlineError(existingClass.match_deadline_at ?? null);
      }
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

      const topicMemberRes = await userHasClassInTopic({
        deviceId,
        worldKey,
        topicKey,
      });
      if (!topicMemberRes.ok) return topicMemberRes.response;

      if (
        !topicMemberRes.isMember &&
        topicRes.row?.match_deadline_at &&
        isDeadlinePassed(topicRes.row.match_deadline_at)
      ) {
        return deadlineError(topicRes.row.match_deadline_at);
      }
    }

    const atomicRes = await callMatchJoinAtomicV3({
      deviceId,
      joinDisplayName,
      forcedClassId: forcedClassId || null,
      worldKey,
      topicKey,
      requestedCapacity,
      classSlots,
      blockedDeviceIds,
      requestedMinAge,
      requestedMaxAge,
    });

    if (!atomicRes.ok) return atomicRes.response;

    const row = atomicRes.row;
    const recruitmentSessionTtlSetting = await getRecruitmentSessionTtlSetting();
    const recruitmentSessionTtlMinutes = recruitmentSessionTtlSetting.unlimited
      ? null
      : recruitmentSessionTtlSetting.minutes ??
        (await getRecruitmentSessionTtlMinutes());

    if (!openJoinedClass && blocksNewJoinSessionStatus(row.session_status)) {
      console.warn("[class/match-join-v2] blocked non-recruiting session on normal path", {
        openJoinedClass,
        forcedClassId: forcedClassId || null,
        classId: row.class_id,
        sessionId: row.session_id,
        sessionStatus: row.session_status,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "recruitment_closed",
          sessionStatus: String(row.session_status ?? ""),
          sessionId: String(row.session_id ?? ""),
          message: "このクラスは現在募集していません。",
        },
        { status: 403 }
      );
    }

    if (
      !openJoinedClass &&
      isRecruitingSessionStatus(row.session_status) &&
      !isSessionEligibleForNormalJoin({
        sessionStatus: row.session_status,
        sessionCreatedAt: row.session_created_at,
        recruitmentSessionTtlMinutes,
      })
    ) {
      console.warn(
        "[class/match-join-v2] blocked stale or invalid session on normal path",
        {
          openJoinedClass,
          forcedClassId: forcedClassId || null,
          classId: row.class_id,
          sessionId: row.session_id,
          sessionStatus: row.session_status,
          sessionCreatedAt: row.session_created_at,
          recruitmentSessionTtlMinutes,
          recruitmentSessionTtlUnlimited: recruitmentSessionTtlSetting.unlimited,
        }
      );

      return NextResponse.json(
        {
          ok: false,
          error: "recruitment_closed",
          sessionStatus: String(row.session_status ?? ""),
          sessionId: String(row.session_id ?? ""),
          sessionCreatedAt: row.session_created_at ?? null,
          recruitmentSessionTtlMinutes,
          recruitmentSessionTtlUnlimited: recruitmentSessionTtlSetting.unlimited,
          message: "このクラスは現在募集していません。",
        },
        { status: 403 }
      );
    }

    console.log("[class/match-join-v2] success", {
      requestId,
      deviceId,
      worldKey,
      topicKey,
      minAge: requestedMinAge,
      maxAge: requestedMaxAge,
      capacity: requestedCapacity,
      openJoinedClass,
      forcedClassId: forcedClassId || null,
      classId: row.class_id,
      className: row.class_name,
      sessionId: row.session_id,
      sessionStatus: row.session_status,
      status: row.session_status,
      sessionCreatedAt: row.session_created_at,
      recruitmentSessionTtlMinutes,
      recruitmentSessionTtlUnlimited: recruitmentSessionTtlSetting.unlimited,
      expiredCount: Number(row.expired_count ?? 0),
      candidateSessionCount: Number(row.candidate_session_count ?? 0),
      createdNewSession: Boolean(row.created_new_session),
      createdNewClass: Boolean(row.created_new_class),
      reused: row.reused,
      alreadyJoined: row.already_joined,
      billableCount: membershipSnapshot.billableCount,
      classSlots,
    });

    return NextResponse.json(
      {
        ok: true,
        requestId,
        classId: String(row.class_id),
      className: String(row.class_name ?? "").trim() || "クラス",
      sessionId: String(row.session_id),
      sessionStatus: String(row.session_status ?? "forming"),
      sessionCreatedAt: row.session_created_at ?? null,
      recruitmentSessionTtlMinutes,
      recruitmentSessionTtlUnlimited: recruitmentSessionTtlSetting.unlimited,
      expiredCount: Number(row.expired_count ?? 0),
      candidateSessionCount: Number(row.candidate_session_count ?? 0),
      createdNewSession: Boolean(row.created_new_session),
      createdNewClass: Boolean(row.created_new_class),
      requestedCapacity,
      requestedMinAge,
      requestedMaxAge,
      selfAge,
      alreadyJoined: Boolean(row.already_joined),
      reused: Boolean(row.reused),
      currentCount: Number(
        row.current_count ?? membershipSnapshot.billableCount
      ),
      billableMembershipCount: membershipSnapshot.billableCount,
      totalMembershipCount: membershipSnapshot.totalCount,
      legacyMembershipCount: membershipSnapshot.legacyCount,
      classSlots,
      blockedDeviceCount: blockedDeviceIds.length,
    });
  } catch (e: unknown) {
    console.error("[class/match-join-v2] server error =", e);
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
