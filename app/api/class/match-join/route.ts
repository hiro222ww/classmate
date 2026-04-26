import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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
  birth_date?: string | null;
};

type AtomicMatchRow = {
  class_id: string;
  class_name: string;
  session_id: string;
  session_status: string | null;
  session_created_at: string | null;
  reused: boolean;
};

type ClassDeadlineRow = {
  id: string;
  name?: string | null;
  world_key?: string | null;
  topic_key?: string | null;
  match_deadline_at?: string | null;
};

type TopicDeadlineRow = {
  key?: string | null;
  world_key?: string | null;
  match_deadline_at?: string | null;
};

async function getProfile(deviceId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("device_id,birth_date")
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
    .map((x: any) => String(x.class_id ?? "").trim())
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
    .map((x: any) => String(x.class_id ?? "").trim())
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
          code: (insErr as any)?.code ?? null,
          hint: (insErr as any)?.hint ?? null,
          details: (insErr as any)?.details ?? null,
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
  const { worldKey, topicKey } = params;

  if (!topicKey) {
    return {
      ok: true as const,
      row: null,
    };
  }

  let query = supabase
    .from("topics")
    .select("key,world_key,match_deadline_at")
    .eq("key", topicKey)
    .limit(1);

  if (worldKey) {
    query = query.eq("world_key", worldKey);
  }

  const { data, error } = await query.maybeSingle();

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

async function runAtomicMatch(params: {
  worldKey: string;
  topicKey: string | null;
  requestedCapacity: number;
  requestedMinAge: number;
  requestedMaxAge: number;
  deviceId: string;
}) {
  const {
    worldKey,
    topicKey,
    requestedCapacity,
    requestedMinAge,
    requestedMaxAge,
    deviceId,
  } = params;

  const { data, error } = await supabase.rpc("match_join_atomic", {
    p_world_key: worldKey,
    p_topic_key: topicKey,
    p_requested_capacity: requestedCapacity,
    p_requested_min_age: requestedMinAge,
    p_requested_max_age: requestedMaxAge,
    p_device_id: deviceId,
  });

  console.log("🔥 RPC RESULT", {
    params,
    data,
    error,
  });

  if (error) {
    console.error("❌ RPC ERROR FULL", error);

    const message = String(error.message ?? "");
    const detail = String((error as any).details ?? (error as any).detail ?? "");

    if (message.includes("class_slots_limit")) {
      let parsed: any = null;

      try {
        parsed = detail ? JSON.parse(detail) : null;
      } catch {
        parsed = null;
      }

      return {
        ok: false as const,
        response: NextResponse.json(
          {
            ok: false,
            error: "class_slots_limit",
            currentCount: parsed?.currentCount ?? null,
            classSlots: parsed?.classSlots ?? null,
          },
          { status: 400 }
        ),
      };
    }

    if (message.includes("match_deadline_passed")) {
      return {
        ok: false as const,
        response: deadlineError(null),
      };
    }

    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "match_join_atomic_failed",
          detail: error.message,
          raw: error,
        },
        { status: 500 }
      ),
    };
  }

  const row = ((data ?? [])[0] ?? null) as AtomicMatchRow | null;

  if (!row?.class_id || !row?.session_id) {
    console.error("❌ RPC EMPTY", data);

    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "match_join_atomic_empty",
          data,
        },
        { status: 500 }
      ),
    };
  }

  return { ok: true as const, row };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body.deviceId ?? "").trim();
    const worldKey = String(body.worldKey ?? "default").trim() || "default";
    const topicKey = normalizeTopicKey(body.topicKey);
    const requestedCapacity = normalizeCapacity(body.capacity);
    const forcedClassId = String(body.classId ?? "").trim();

    console.log("🔥 MATCH JOIN ATOMIC MEMBERSHIP VERSION LOADED");
    console.log("[class/match-join] body =", body);
    console.log("[class/match-join] deviceId =", deviceId);
    console.log("[class/match-join] topicKey =", topicKey);
    console.log("[class/match-join] worldKey =", worldKey);
    console.log("[class/match-join] requestedCapacity =", requestedCapacity);
    console.log("[class/match-join] forcedClassId =", forcedClassId);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    const prefsRes = await getMatchPrefs(deviceId);
    if (!prefsRes.ok) return prefsRes.response;

    const fallbackMinAge = normalizeAge(prefsRes.minAge, 0);
    const fallbackMaxAge = normalizeAge(prefsRes.maxAge, 120);

    const rawMinAge = normalizeAge(body.minAge, fallbackMinAge);
    const rawMaxAge = normalizeAge(body.maxAge, fallbackMaxAge);
    const requestedMinAge = Math.min(rawMinAge, rawMaxAge);
    const requestedMaxAge = Math.max(rawMinAge, rawMaxAge);

    console.log("[class/match-join] prefs fallback =", {
      minAge: fallbackMinAge,
      maxAge: fallbackMaxAge,
    });
    console.log("[class/match-join] final ages =", {
      bodyMinAge: body.minAge ?? null,
      bodyMaxAge: body.maxAge ?? null,
      requestedMinAge,
      requestedMaxAge,
    });

    const profileRes = await getProfile(deviceId);
    if (!profileRes.ok) return profileRes.response;

    const selfAge = calcAgeFromBirthDate(profileRes.profile.birth_date);

    console.log("[class/match-join] self profile =", {
      deviceId,
      selfAge,
      birth_date: profileRes.profile.birth_date ?? null,
    });

    const slotsRes = await getClassSlots(deviceId);
    if (!slotsRes.ok) return slotsRes.response;
    const classSlots = slotsRes.classSlots;

    const allMembershipsRes = await getAllMembershipIds(deviceId);
    if (!allMembershipsRes.ok) return allMembershipsRes.response;
    const allMembershipIdsBefore = allMembershipsRes.ids;

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

      console.log("[match-join] deadline check", {
        branch: "forcedClassId",
        forcedClassId,
        classId: existingClass.id,
        topicKey: existingClass.topic_key ?? null,
        worldKey: existingClass.world_key ?? null,
        matchDeadlineAt: existingClass.match_deadline_at ?? null,
        now: new Date().toISOString(),
      });

      const membershipCheck = await hasMembership(deviceId, forcedClassId);
      if (!membershipCheck.ok) return membershipCheck.response;

      const isExistingMember = membershipCheck.isMember;

      console.log("[match-join] forced membership check", {
        deviceId,
        forcedClassId,
        isExistingMember,
      });

      if (
        !isExistingMember &&
        isDeadlinePassed(existingClass.match_deadline_at ?? null)
      ) {
        console.log("[match-join] deadline blocked", {
          branch: "forcedClassId",
          classId: existingClass.id,
          matchDeadlineAt: existingClass.match_deadline_at ?? null,
        });
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

      const { data: existingSession, error: sessionErr } = await supabase
        .from("sessions")
        .select("id,status,created_at,capacity")
        .eq("class_id", classId)
        .in("status", ["forming", "waiting", "active"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

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

      if (existingSession?.id) {
        sessionId = String(existingSession.id);
        sessionStatus = String(existingSession.status ?? "forming");
        sessionCreatedAt = existingSession.created_at ?? null;
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
    } else {
      const topicRes = await getTopicDeadline({ worldKey, topicKey });
      if (!topicRes.ok) return topicRes.response;

      if (topicRes.row?.match_deadline_at) {
        console.log("[match-join] deadline check", {
          branch: "topic-before-atomic",
          topicKey,
          worldKey,
          matchDeadlineAt: topicRes.row.match_deadline_at,
          now: new Date().toISOString(),
        });

        if (isDeadlinePassed(topicRes.row.match_deadline_at)) {
          console.log("[match-join] deadline blocked", {
            branch: "topic-before-atomic",
            topicKey,
            matchDeadlineAt: topicRes.row.match_deadline_at,
          });
          return deadlineError(topicRes.row.match_deadline_at);
        }
      }

      const atomicRes = await runAtomicMatch({
        worldKey,
        topicKey,
        requestedCapacity,
        requestedMinAge,
        requestedMaxAge,
        deviceId,
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

      console.log("[match-join] deadline check", {
        branch: "post-atomic-class",
        classId: matchedClassRes.row.id,
        topicKey: matchedClassRes.row.topic_key ?? null,
        worldKey: matchedClassRes.row.world_key ?? null,
        matchDeadlineAt: matchedClassRes.row.match_deadline_at ?? null,
        now: new Date().toISOString(),
      });

      if (isDeadlinePassed(matchedClassRes.row.match_deadline_at ?? null)) {
        console.log("[match-join] deadline blocked", {
          branch: "post-atomic-class",
          classId: matchedClassRes.row.id,
          matchDeadlineAt: matchedClassRes.row.match_deadline_at ?? null,
        });
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
    });
  } catch (e: any) {
    console.error("[class/match-join] server error =", e);
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