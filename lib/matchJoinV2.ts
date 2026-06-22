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
import { evaluateClassSlotsLimit } from "@/lib/classMembershipSlots";
import {
  blockNewJoinIfAdmissionClosed,
  canRejoinFromEligibility,
  loadRejoinEligibility,
} from "@/lib/admissionMembership";
import { ensureClassSessionMembership } from "@/lib/ensureClassSessionMembership";
import {
  logMatchJoinPrefs,
  logMatchJoinRpcResult,
  logMatchJoinStart,
  tailMatchId,
} from "@/lib/matchJoinLogging";
import { isJoinAllowedDeviceId } from "@/lib/deviceIdValidation";
import { rollbackPartialJoinState } from "@/lib/joinStateRollback";
import { resolveMatchJoinUserMessage } from "@/lib/matchJoinUserMessage";
import { resolveOpenJoinedClassSession } from "@/lib/openJoinedClassSession";
import { closeEmptySessionIfNeeded } from "@/lib/sessionLifecycle";
import {
  applyAgeModeToMatchRange,
  checkSelfAgeForJoin,
  checkTopicAgeAccess,
  getEffectiveAgeMode,
  type AgeMode,
} from "@/lib/agePolicy";
import {
  fetchBlockedDeviceIdsForActor,
  getClassSlotsForActor,
  membershipFilterForActor,
  resolveApiActor,
  type ActorLookup,
} from "@/lib/actorIdentity";
import { readMatchPrefsForActor } from "@/lib/matchPrefsStorage";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeActor(actor: {
  userId?: string | null;
  deviceId: string;
}): ActorLookup {
  return {
    userId: actor.userId ?? null,
    deviceId: actor.deviceId,
  };
}

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
      message: "このクラスへの参加受付は締め切られました",
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
  min_age?: number | null;
  is_sensitive?: boolean | null;
};

type TopicDeadlineRow = {
  topic_key?: string | null;
  match_deadline_at?: string | null;
};

type TopicGenderRestrictionRow = {
  topic_key?: string | null;
  gender_restriction?: string | null;
  accepting_new_users?: boolean | null;
  is_active?: boolean | null;
  is_archived?: boolean | null;
  is_sensitive?: boolean | null;
  min_age?: number | null;
};

function resolveJoinDisplayName(profile: ProfileRow) {
  return String(profile.display_name ?? "").trim() || "参加者";
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function logSimilarRecruitingClasses(params: {
  worldKey: string;
  topicKey: string | null;
  excludeClassId: string;
  requestId: string;
  createdNewClass: boolean;
}) {
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id,class_id,status,created_at")
    .in("status", ["forming", "waiting"])
    .gte("created_at", new Date(Date.now() - 3 * 60 * 1000).toISOString())
    .limit(30);

  if (error || !sessions?.length) return;

  const classIds = Array.from(
    new Set(
      sessions
        .map((s) => String(s.class_id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (classIds.length === 0) return;

  const { data: classes } = await supabase
    .from("classes")
    .select("id,world_key,topic_key")
    .in("id", classIds);

  const similar = (classes ?? []).filter((c) => {
    if (String(c.id) === params.excludeClassId) return false;
    if (String(c.world_key ?? "default") !== params.worldKey) return false;
    const topic = normalizeTopicKey(c.topic_key);
    return topic === params.topicKey;
  });

  if (similar.length === 0) return;

  console.warn(
    `[match-join] race-detected similarClasses=${similar
      .map((c) => tailMatchId(String(c.id)))
      .join(",")} requestId=${params.requestId.slice(0, 8)} ` +
      `createdNew=${params.createdNewClass} topic=${params.topicKey ?? "free"}`
  );
}

async function getBlockedDeviceIds(actor: {
  userId?: string | null;
  deviceId: string;
}) {
  try {
    const ids = await fetchBlockedDeviceIdsForActor(supabase, normalizeActor(actor));
    return { ok: true as const, ids };
  } catch (error) {
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
}

async function getProfile(actor: { userId?: string | null; deviceId: string }) {
  const userId = String(actor.userId ?? "").trim();
  const deviceId = actor.deviceId;

  let data: ProfileRow | null = null;

  if (userId) {
    const byUser = await supabase
      .from("user_profiles")
      .select("device_id,display_name,birth_date,gender")
      .eq("user_id", userId)
      .maybeSingle();

    if (byUser.error) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            ok: false,
            error: "profile_lookup_failed",
            ...formatPostgresError(byUser.error),
          },
          { status: 500 }
        ),
      };
    }

    data = (byUser.data as ProfileRow | null) ?? null;
  }

  if (!data) {
    const byDevice = await supabase
      .from("user_profiles")
      .select("device_id,display_name,birth_date,gender")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (byDevice.error) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            ok: false,
            error: "profile_lookup_failed",
            ...formatPostgresError(byDevice.error),
          },
          { status: 500 }
        ),
      };
    }

    data = (byDevice.data as ProfileRow | null) ?? null;
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

async function getClassSlots(actor: { userId?: string | null; deviceId: string }) {
  const slotsRes = await getClassSlotsForActor(supabase, normalizeActor(actor));

  if (!slotsRes.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "entitlements_lookup_failed",
          detail: slotsRes.error,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    classSlots: slotsRes.classSlots,
  };
}

async function getAllMembershipIds(actor: {
  userId?: string | null;
  deviceId: string;
}) {
  const filter = membershipFilterForActor(normalizeActor(actor));
  let query = supabase.from("class_memberships").select("class_id");

  if (filter.column === "user_id") {
    query = query.eq("user_id", filter.value);
  } else {
    query = query.eq("device_id", filter.value);
  }

  const { data, error } = await query;

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

async function getMatchPrefs(actor: { userId?: string | null; deviceId: string }) {
  try {
    const prefs = await readMatchPrefsForActor(supabase, normalizeActor(actor));
    return {
      ok: true as const,
      minAge: Number(prefs?.min_age ?? 0),
      maxAge: Number(prefs?.max_age ?? 120),
    };
  } catch (error) {
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
}

async function getForcedClassWithDeadline(classId: string) {
  const { data, error } = await supabase
    .from("classes")
    .select("id,name,world_key,topic_key,match_deadline_at,min_age,is_sensitive")
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
  userId?: string | null;
  worldKey: string;
  topicKey: string | null;
}) {
  const membershipRes = await getAllMembershipIds({
    deviceId: params.deviceId,
    userId: params.userId ?? null,
  });
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
    .select("topic_key,gender_restriction,accepting_new_users,is_active,is_archived,is_sensitive,min_age")
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
  if (params.topic?.is_archived) {
    return NextResponse.json(
      {
        ok: false,
        error: "topic_not_available",
        message: "このテーマは現在利用できません",
      },
      { status: 403 }
    );
  }

  if (params.topic?.is_active === false) {
    return NextResponse.json(
      {
        ok: false,
        error: "topic_not_active",
        message: "このテーマは現在利用できません",
      },
      { status: 403 }
    );
  }

  if (params.topic?.accepting_new_users === false) {
    return NextResponse.json(
      {
        ok: false,
        error: "topic_recruitment_closed",
        message: "このテーマは現在新規受付を停止しています",
      },
      { status: 403 }
    );
  }

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

async function enforceAdmissionForNewJoin(params: {
  deviceId: string;
  classId?: string;
  sessionId?: string;
}) {
  const blocked = await blockNewJoinIfAdmissionClosed({
    deviceId: params.deviceId,
    classId: params.classId ?? "",
    sessionId: params.sessionId,
  });
  if (blocked) return blocked;

  return null;
}

function topicAgeBlockedResponse(
  result: Extract<ReturnType<typeof checkTopicAgeAccess>, { ok: false }>
) {
  return NextResponse.json(
    {
      ok: false,
      error: result.error,
      message: result.message,
    },
    { status: 403 }
  );
}

function resolveTopicAgeMeta(params: {
  classMinAge?: number | null;
  classIsSensitive?: boolean | null;
  topicRow?: {
    min_age?: number | null;
    is_sensitive?: boolean | null;
  } | null;
}) {
  return {
    topicMinAge: Math.max(
      Number(params.classMinAge ?? 0),
      Number(params.topicRow?.min_age ?? 0)
    ),
    isSensitive:
      Boolean(params.classIsSensitive) || Boolean(params.topicRow?.is_sensitive),
  };
}

export async function matchJoinV2Post(req: Request) {
  try {
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
    const forcedSessionId = openJoinedClass
      ? String(body.sessionId ?? body.session_id ?? "").trim()
      : "";

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

    if (!isJoinAllowedDeviceId(deviceId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_deviceId",
          message: resolveMatchJoinUserMessage("invalid_deviceId"),
        },
        { status: 400 }
      );
    }

    const actorResult = await resolveApiActor({ req, deviceId });
    const userId = actorResult.ok ? actorResult.actor.userId : "";
    const actor = { userId: userId || null, deviceId };

    const admissionBlocked = await enforceAdmissionForNewJoin({
      deviceId,
      classId: forcedClassId,
      sessionId: forcedSessionId || undefined,
    });
    if (admissionBlocked) return admissionBlocked;

    const rejoinEligibility = forcedClassId
      ? await loadRejoinEligibility({
          deviceId,
          classId: forcedClassId,
          sessionId: forcedSessionId || undefined,
        })
      : { existingClassMember: false, existingSessionMember: false };
    const canRejoinTargetClass = canRejoinFromEligibility(rejoinEligibility);

    if (canRejoinTargetClass) {
      console.log("[class/match-join-v2] rejoin eligible", {
        deviceId,
        userId: userId || null,
        classId: forcedClassId,
        openJoinedClass,
      });
    }

    const blockedRes = await getBlockedDeviceIds(actor);
    if (!blockedRes.ok) return blockedRes.response;
    const blockedDeviceIds = blockedRes.ids;

    const prefsRes = await getMatchPrefs(actor);
    if (!prefsRes.ok) return prefsRes.response;

    const fallbackMinAge = normalizeAge(prefsRes.minAge, 0);
    const fallbackMaxAge = normalizeAge(prefsRes.maxAge, 120);

    const rawMinAge = normalizeAge(body.minAge, fallbackMinAge);
    const rawMaxAge = normalizeAge(body.maxAge, fallbackMaxAge);
    let requestedMinAge = Math.min(rawMinAge, rawMaxAge);
    let requestedMaxAge = Math.max(rawMinAge, rawMaxAge);

    logMatchJoinStart({
      requestId,
      deviceId,
      prefs: {
        topicKey,
        worldKey,
        minAge: requestedMinAge,
        maxAge: requestedMaxAge,
        capacity: requestedCapacity,
        openJoinedClass,
      },
    });

    const profileRes = await getProfile(actor);
    if (!profileRes.ok) return profileRes.response;

    const selfProfile = profileRes.profile;
    const joinDisplayName = resolveJoinDisplayName(selfProfile);
    const selfAge = calcAgeFromBirthDate(selfProfile.birth_date);

    const ageMode: AgeMode = await getEffectiveAgeMode();
    const selfAgeCheck = checkSelfAgeForJoin(selfAge, ageMode);
    if (!selfAgeCheck.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: selfAgeCheck.error,
          message:
            selfAgeCheck.message ||
            resolveMatchJoinUserMessage(selfAgeCheck.error),
        },
        { status: 403 }
      );
    }

    const ageRanged = applyAgeModeToMatchRange(
      ageMode,
      requestedMinAge,
      requestedMaxAge,
      selfAge
    );
    requestedMinAge = ageRanged.minAge;
    requestedMaxAge = ageRanged.maxAge;

    logMatchJoinPrefs({
      requestId,
      prefs: {
        topicKey,
        worldKey,
        minAge: requestedMinAge,
        maxAge: requestedMaxAge,
        capacity: requestedCapacity,
        openJoinedClass,
      },
      selfAge,
    });

    if (
      !openJoinedClass &&
      (requestedMinAge !== fallbackMinAge || requestedMaxAge !== fallbackMaxAge)
    ) {
      console.log(
        `[match-join] prefs-source requestId=${requestId.slice(0, 8)} ` +
          `bodyAge=${requestedMinAge}-${requestedMaxAge} dbAge=${fallbackMinAge}-${fallbackMaxAge}`
      );
    }

    const slotEval = await evaluateClassSlotsLimit(supabase, deviceId, {
      joiningClassId: forcedClassId || null,
      userId: userId || null,
    });
    if (!slotEval.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "memberships_lookup_failed",
          detail: slotEval.error,
        },
        { status: 500 }
      );
    }

    const slotContext = slotEval.context;
    const classSlots = slotContext.slotLimit;
    const membershipSnapshot = slotContext.snapshot;
    const allMembershipIdsBefore = slotContext.slotCountClassIds;

    if (!slotEval.allowed) {
      console.log(
        `[match-join] reject class_slot_limit active=${slotContext.slotCount} limit=${classSlots}`
      );
      console.warn("[class/match-join-v2] class_slots_limit", {
        deviceId,
        classSlots,
        slotCount: slotContext.slotCount,
        visibleClassIds: slotContext.visibleClassIds,
        slotCountClassIds: slotContext.slotCountClassIds,
        totalMembershipCount: membershipSnapshot.totalCount,
        legacyMembershipCount: membershipSnapshot.legacyCount,
        billableClassIds: membershipSnapshot.billableClassIds,
        legacyClassIds: membershipSnapshot.legacyClassIds,
        excludedReasons: slotContext.excludedReasons,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: slotContext.slotCount,
          totalMembershipCount: membershipSnapshot.totalCount,
          legacyMembershipCount: membershipSnapshot.legacyCount,
          classSlots,
          visibleClassIds: slotContext.visibleClassIds,
          slotCountClassIds: slotContext.slotCountClassIds,
        },
        { status: 400 }
      );
    }

    let forcedClassDeadline: string | null = null;

    if (forcedClassId) {
      const forcedRes = await getForcedClassWithDeadline(forcedClassId);
      if (!forcedRes.ok) return forcedRes.response;

      const existingClass = forcedRes.row;
      forcedClassDeadline = existingClass.match_deadline_at ?? null;

      const topicGenderRes = await getTopicGenderRestriction(
        existingClass.topic_key ?? null
      );
      if (!topicGenderRes.ok) return topicGenderRes.response;

      const genderBlocked = checkGenderRestriction({
        topic: topicGenderRes.row,
        profile: selfProfile,
      });
      if (genderBlocked) return genderBlocked;

      const topicAgeMeta = resolveTopicAgeMeta({
        classMinAge: existingClass.min_age,
        classIsSensitive: existingClass.is_sensitive,
        topicRow: topicGenderRes.row,
      });
      const topicAgeBlocked = checkTopicAgeAccess({
        mode: ageMode,
        selfAge,
        isSensitive: topicAgeMeta.isSensitive,
        topicMinAge: topicAgeMeta.topicMinAge,
      });
      if (!topicAgeBlocked.ok) return topicAgeBlockedResponse(topicAgeBlocked);

      const membershipCheck = await hasMembership(deviceId, forcedClassId);
      if (!membershipCheck.ok) return membershipCheck.response;

      if (openJoinedClass && !membershipCheck.isMember) {
        console.log(
          `[match-join] blocked reason=membership_left class=${tailMatchId(forcedClassId)} ` +
            `device=${tailMatchId(deviceId)}`
        );
        return NextResponse.json(
          { ok: false, error: "membership_left" },
          { status: 403 }
        );
      }

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

      const topicAgeMeta = resolveTopicAgeMeta({
        topicRow: topicGenderRes.row,
      });
      const topicAgeBlocked = checkTopicAgeAccess({
        mode: ageMode,
        selfAge,
        isSensitive: topicAgeMeta.isSensitive,
        topicMinAge: topicAgeMeta.topicMinAge,
      });
      if (!topicAgeBlocked.ok) return topicAgeBlockedResponse(topicAgeBlocked);

      const topicRes = await getTopicDeadline({ worldKey, topicKey });
      if (!topicRes.ok) return topicRes.response;

      const topicMemberRes = await userHasClassInTopic({
        deviceId,
        userId: userId || null,
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
      requestId,
    });

    if (!atomicRes.ok) return atomicRes.response;

    const row = atomicRes.row;
    const recruitmentSessionTtlSetting = await getRecruitmentSessionTtlSetting();
    const recruitmentSessionTtlMinutes = recruitmentSessionTtlSetting.unlimited
      ? null
      : recruitmentSessionTtlSetting.minutes ??
        (await getRecruitmentSessionTtlMinutes());

    const rpcSessionId = String(row.session_id ?? "").trim();
    let resolvedSessionId = rpcSessionId;
    let resolvedSessionStatus = String(row.session_status ?? "forming");
    let resolvedSessionCreatedAt = row.session_created_at ?? null;
    let resolvedCreatedNewSession = Boolean(row.created_new_session);
    let resolvedReused = Boolean(row.reused);
    let resolvedSelectionReason = "";

    if (openJoinedClass && forcedClassId) {
      const resolved = await resolveOpenJoinedClassSession({
        classId: String(row.class_id),
        className: String(row.class_name ?? "").trim() || "クラス",
        sessionId: resolvedSessionId,
        sessionStatus: resolvedSessionStatus,
        sessionCreatedAt: resolvedSessionCreatedAt,
        matchDeadlineAt: forcedClassDeadline,
        deviceId,
        requestedCapacity,
        recruitmentSessionTtlMinutes,
        hintSessionId: forcedSessionId || resolvedSessionId,
      });

      if (!resolved.ok) return resolved.response;

      resolvedSessionId = resolved.sessionId;
      resolvedSessionStatus = resolved.sessionStatus;
      resolvedSessionCreatedAt = resolved.sessionCreatedAt;
      resolvedCreatedNewSession = resolved.createdNewSession;
      resolvedReused = resolved.reused;
      resolvedSelectionReason = resolved.selectionReason;

      console.log(
        `[class-session] match-join-resolve class=${tailMatchId(String(row.class_id))} ` +
          `rpc=${tailMatchId(rpcSessionId)} resolved=${tailMatchId(resolvedSessionId)} ` +
          `hint=${tailMatchId(forcedSessionId || "-")} ` +
          `createdNew=${resolvedCreatedNewSession} reused=${resolvedReused} ` +
          `reason=${resolved.selectionReason}`
      );

      if (
        resolvedCreatedNewSession &&
        rpcSessionId &&
        resolvedSessionId !== rpcSessionId
      ) {
        await supabase
          .from("session_members")
          .delete()
          .eq("session_id", rpcSessionId)
          .eq("device_id", deviceId);
        await closeEmptySessionIfNeeded(supabase, rpcSessionId);
      }
    }

    if (openJoinedClass && blocksNewJoinSessionStatus(resolvedSessionStatus)) {
      console.warn(
        `[class/match-join-v2] resolved session not joinable status=${resolvedSessionStatus} ` +
          `session=${tailMatchId(resolvedSessionId)} — re-resolving`
      );
      const staleResolvedId = resolvedSessionId;
      const reResolved = await resolveOpenJoinedClassSession({
        classId: String(row.class_id),
        className: String(row.class_name ?? "").trim() || "クラス",
        sessionId: "",
        sessionStatus: "forming",
        sessionCreatedAt: null,
        matchDeadlineAt: forcedClassDeadline,
        deviceId,
        requestedCapacity,
        recruitmentSessionTtlMinutes,
      });
      if (reResolved.ok) {
        if (
          reResolved.createdNewSession &&
          staleResolvedId &&
          reResolved.sessionId !== staleResolvedId
        ) {
          await supabase
            .from("session_members")
            .delete()
            .eq("session_id", staleResolvedId)
            .eq("device_id", deviceId);
          await closeEmptySessionIfNeeded(supabase, staleResolvedId);
        }
        resolvedSessionId = reResolved.sessionId;
        resolvedSessionStatus = reResolved.sessionStatus;
        resolvedSessionCreatedAt = reResolved.sessionCreatedAt;
        resolvedCreatedNewSession = reResolved.createdNewSession;
        resolvedReused = reResolved.reused;
      }
    }

    const classIdOut = String(row.class_id ?? "").trim();
    if (!classIdOut || !resolvedSessionId) {
      console.log("[match-join] reject reason=incomplete_match_result", {
        classId: classIdOut,
        sessionId: resolvedSessionId,
        openJoinedClass,
      });
      return NextResponse.json(
        { ok: false, error: "match_join_incomplete" },
        { status: 500 }
      );
    }

    if (
      !openJoinedClass &&
      !canRejoinTargetClass &&
      blocksNewJoinSessionStatus(resolvedSessionStatus)
    ) {
      console.warn("[class/match-join-v2] blocked non-recruiting session on normal path", {
        openJoinedClass,
        canRejoinTargetClass,
        forcedClassId: forcedClassId || null,
        classId: row.class_id,
        sessionId: row.session_id,
        sessionStatus: resolvedSessionStatus,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "recruitment_closed",
          sessionStatus: resolvedSessionStatus,
          sessionId: resolvedSessionId,
          message: "このクラスは現在募集していません。",
        },
        { status: 403 }
      );
    }

    if (
      !openJoinedClass &&
      !canRejoinTargetClass &&
      isRecruitingSessionStatus(resolvedSessionStatus) &&
      !isSessionEligibleForNormalJoin({
        sessionStatus: resolvedSessionStatus,
        sessionCreatedAt: resolvedSessionCreatedAt,
        recruitmentSessionTtlMinutes,
      })
    ) {
      console.warn(
        "[class/match-join-v2] blocked stale or invalid session on normal path",
        {
          openJoinedClass,
          canRejoinTargetClass,
          forcedClassId: forcedClassId || null,
          classId: row.class_id,
          sessionId: row.session_id,
          sessionStatus: resolvedSessionStatus,
          sessionCreatedAt: resolvedSessionCreatedAt,
          recruitmentSessionTtlMinutes,
          recruitmentSessionTtlUnlimited: recruitmentSessionTtlSetting.unlimited,
        }
      );

      return NextResponse.json(
        {
          ok: false,
          error: "recruitment_closed",
          sessionStatus: resolvedSessionStatus,
          sessionId: resolvedSessionId,
          sessionCreatedAt: resolvedSessionCreatedAt,
          recruitmentSessionTtlMinutes,
          recruitmentSessionTtlUnlimited: recruitmentSessionTtlSetting.unlimited,
          message: "このクラスは現在募集していません。",
        },
        { status: 403 }
      );
    }

    const raceMerged = Boolean(row.race_merged);
    const createdNewClass =
      Boolean(row.created_new_class) && !raceMerged;

    await logSimilarRecruitingClasses({
      worldKey,
      topicKey,
      excludeClassId: String(row.class_id),
      requestId,
      createdNewClass,
    });

    const joinState = await ensureClassSessionMembership({
      classId: classIdOut,
      sessionId: resolvedSessionId,
      deviceId,
      source: openJoinedClass ? "restore" : "normal_join",
      displayName: joinDisplayName,
    });

    if (!joinState.ok) {
      await rollbackPartialJoinState({
        classId: classIdOut,
        sessionId: resolvedSessionId,
        deviceId,
        failedStep: joinState.failedStep,
      });
      console.warn(
        `[match-join] join-state-failed requestId=${requestId.slice(0, 8)} ` +
          `error=${joinState.error} class=${tailMatchId(String(row.class_id))} ` +
          `session=${tailMatchId(resolvedSessionId)}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: joinState.error || "join_state_failed",
          message: resolveMatchJoinUserMessage(joinState.error),
          joinState,
        },
        { status: joinState.status === "blocked" ? 400 : 500 }
      );
    }

    logMatchJoinRpcResult({
      requestId,
      deviceId,
      classId: classIdOut,
      sessionId: resolvedSessionId,
      createdNewClass,
      createdNewSession: resolvedCreatedNewSession,
      reused: resolvedReused,
      raceMerged,
      candidateSessionCount: Number(row.candidate_session_count ?? 0),
    });

    return NextResponse.json(
      {
        ok: true,
        requestId,
        classId: classIdOut,
      className: String(row.class_name ?? "").trim() || "クラス",
      sessionId: resolvedSessionId,
      sessionStatus: resolvedSessionStatus,
      sessionCreatedAt: resolvedSessionCreatedAt,
      recruitmentSessionTtlMinutes,
      recruitmentSessionTtlUnlimited: recruitmentSessionTtlSetting.unlimited,
      expiredCount: Number(row.expired_count ?? 0),
      candidateSessionCount: Number(row.candidate_session_count ?? 0),
      createdNewSession: resolvedCreatedNewSession,
      selectionReason: resolvedSelectionReason || null,
      createdNewClass,
      raceMerged,
        joinStateOk: true,
      requestedCapacity,
      requestedMinAge,
      requestedMaxAge,
      selfAge,
      alreadyJoined: Boolean(row.already_joined),
      reused: resolvedReused,
      currentCount: Number(row.current_count ?? slotContext.slotCount),
      billableMembershipCount: slotContext.slotCount,
      visibleClassIds: slotContext.visibleClassIds,
      slotCountClassIds: slotContext.slotCountClassIds,
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
