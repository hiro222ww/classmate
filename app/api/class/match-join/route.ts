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

// 旧入口系の名前は完全除外
function isLegacyEntryClassName(name: string | null | undefined) {
  const s = String(name ?? "").trim();
  if (!s) return false;

  return (
    s === "女子校" ||
    s === "男子校" ||
    s === "フリークラス" ||
    s === "ホームルーム" ||
    s.startsWith("フリークラス") ||
    s.startsWith("女子校") ||
    s.startsWith("男子校") ||
    s.startsWith("ホームルーム")
  );
}

function buildIndexedClassLabel(n: number) {
  const safe = Math.max(1, Math.floor(n));
  const block = Math.floor((safe - 1) / 26) + 1;
  const letterIndex = (safe - 1) % 26;
  const letter = String.fromCharCode(65 + letterIndex);
  return `クラス${String(block).padStart(4, "0")}${letter}`;
}

// クラス0001A -> 1
// クラス0001B -> 2
// ...
// クラス0002A -> 27
function extractIndexedClassNumber(name: string | null | undefined): number {
  const s = String(name ?? "").trim();
  const m = s.match(/^クラス(\d{4})([A-Z])$/);
  if (!m) return 0;

  const block = parseInt(m[1], 10);
  const letterIndex = m[2].charCodeAt(0) - 65;

  if (!Number.isFinite(block) || block <= 0) return 0;
  if (!Number.isFinite(letterIndex) || letterIndex < 0 || letterIndex > 25) {
    return 0;
  }

  return (block - 1) * 26 + letterIndex + 1;
}

type ClassRow = {
  id: string;
  name: string;
  topic_key: string | null;
  world_key: string | null;
  created_at?: string | null;
};

type SessionRow = {
  id: string;
  class_id: string;
  status?: string | null;
  created_at?: string | null;
};

function normalizeCapacity(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 5;
  return Math.max(2, Math.min(5, Math.floor(n)));
}

async function countSessionMembers(sessionId: string) {
  const { data, error } = await supabase
    .from("session_members")
    .select("device_id")
    .eq("session_id", sessionId)
    .not("device_id", "is", null)
    .neq("device_id", "");

  if (error) throw error;

  const uniqueIds = new Set(
    (data ?? [])
      .map((r: any) => String(r.device_id ?? "").trim())
      .filter(Boolean)
  );

  return uniqueIds.size;
}

async function findAvailableFormingSession(
  classId: string,
  requestedCapacity: number
): Promise<SessionRow | null> {
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id,class_id,status,created_at")
    .eq("class_id", classId)
    .in("status", ["forming", "waiting"])
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = (sessions ?? []) as SessionRow[];

  let best: SessionRow | null = null;
  let bestCount = -1;

  for (const s of rows) {
    const memberCount = await countSessionMembers(s.id);

    console.log("[class/match-join] session memberCount =", {
      classId,
      sessionId: s.id,
      status: s.status,
      memberCount,
      requestedCapacity,
    });

    if (memberCount < requestedCapacity && memberCount > bestCount) {
      best = s;
      bestCount = memberCount;
    }
  }

  return best;
}

async function createSession(
  classId: string,
  requestedCapacity: number
): Promise<SessionRow> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      class_id: classId,
      status: "forming",
      capacity: requestedCapacity,
    })
    .select("id,class_id,status,created_at")
    .single();

  if (error) throw error;
  return data as SessionRow;
}

async function getProfile(deviceId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("device_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "profile_lookup_failed",
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
          error: "profile_required",
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true as const, profile: data };
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
          detail: error.message,
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

async function getCurrentMemberships(deviceId: string) {
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

  const currentIds = (data ?? [])
    .map((x: any) => String(x.class_id ?? "").trim())
    .filter(Boolean);

  return { ok: true as const, currentIds };
}

async function getSameTopicClasses(worldKey: string, topicKey: string | null) {
  let classesQuery = supabase
    .from("classes")
    .select("id,name,topic_key,world_key,created_at")
    .eq("world_key", worldKey)
    .eq("is_user_created", false)
    .order("created_at", { ascending: true });

  const result = topicKey
    ? await classesQuery.eq("topic_key", topicKey)
    : await classesQuery.is("topic_key", null);

  if (result.error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "class_lookup_failed",
          detail: result.error.message,
        },
        { status: 500 }
      ),
    };
  }

  const allSameTopicClasses = (result.data ?? []) as ClassRow[];

  const sameTopicClasses = allSameTopicClasses.filter((c) => {
    return !isLegacyEntryClassName(c?.name);
  });

  return {
    ok: true as const,
    allSameTopicClasses,
    sameTopicClasses,
  };
}

function sortClassesForAutoMatch(
  classes: ClassRow[],
  currentIds: string[],
  preferJoinedClass: boolean
) {
  return [...classes].sort((a, b) => {
    const aJoined = currentIds.includes(String(a.id)) ? 1 : 0;
    const bJoined = currentIds.includes(String(b.id)) ? 1 : 0;

    if (preferJoinedClass) {
      return bJoined - aJoined;
    }

    return aJoined - bJoined;
  });
}

async function ensureMembership(params: {
  deviceId: string;
  classId: string;
  currentIds: string[];
  classSlots: number;
}) {
  const { deviceId, classId, currentIds, classSlots } = params;

  if (currentIds.includes(classId)) {
    return { ok: true as const, alreadyJoined: true, inserted: [] };
  }

  if (currentIds.length >= classSlots) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: currentIds.length,
          classSlots,
        },
        { status: 400 }
      ),
    };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("class_memberships")
    .insert({
      device_id: deviceId,
      class_id: classId,
    })
    .select("device_id,class_id");

  console.log("[class/match-join] inserted =", inserted);
  console.log("[class/match-join] insert error =", insErr);

  if (insErr) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "membership_insert_failed",
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
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body.deviceId ?? "").trim();
    const worldKey = String(body.worldKey ?? "default").trim() || "default";
    const topicKey = normalizeTopicKey(body.topicKey);
    const requestedCapacity = normalizeCapacity(body.capacity);
    const preferJoinedClass = Boolean(body.preferJoinedClass ?? false);

    // これを追加:
    // classId が来たら、そのクラスに固定して session を解決する
    const forcedClassId = String(body.classId ?? "").trim();

    console.log("[class/match-join] body =", body);
    console.log("[class/match-join] deviceId =", deviceId);
    console.log("[class/match-join] topicKey =", topicKey);
    console.log("[class/match-join] worldKey =", worldKey);
    console.log("[class/match-join] requestedCapacity =", requestedCapacity);
    console.log("[class/match-join] preferJoinedClass =", preferJoinedClass);
    console.log("[class/match-join] forcedClassId =", forcedClassId);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    // 0) プロフィール存在チェック
    const profileRes = await getProfile(deviceId);
    if (!profileRes.ok) return profileRes.response;

    // 1) entitlement
    const slotsRes = await getClassSlots(deviceId);
    if (!slotsRes.ok) return slotsRes.response;
    const classSlots = slotsRes.classSlots;

    // 2) 現在所属
    const mineRes = await getCurrentMemberships(deviceId);
    if (!mineRes.ok) return mineRes.response;
    const currentIds = mineRes.currentIds;

    // 3) 同テーマの class 一覧を取得
    const classesRes = await getSameTopicClasses(worldKey, topicKey);
    if (!classesRes.ok) return classesRes.response;

    const { allSameTopicClasses, sameTopicClasses } = classesRes;

    console.log("[class/match-join] all same-topic classes =", allSameTopicClasses);
    console.log("[class/match-join] filtered instance classes =", sameTopicClasses);
    console.log("[class/match-join] currentIds =", currentIds);

    let targetClass: ClassRow | null = null;
    let targetSession: SessionRow | null = null;

    // A) classId 指定あり:
    //    「そのクラスに入る」を最優先で実行
    if (forcedClassId) {
      const forcedClass =
        sameTopicClasses.find((c) => String(c.id) === forcedClassId) ?? null;

      if (!forcedClass) {
        return NextResponse.json(
          {
            ok: false,
            error: "forced_class_not_found",
            classId: forcedClassId,
          },
          { status: 404 }
        );
      }

      // 念のため topic/world 整合も forcedClass 側で担保
      if (String(forcedClass.world_key ?? "") !== String(worldKey)) {
        return NextResponse.json(
          {
            ok: false,
            error: "forced_class_world_mismatch",
            classId: forcedClassId,
          },
          { status: 400 }
        );
      }

      const forcedTopic = normalizeTopicKey(forcedClass.topic_key);
      if (forcedTopic !== topicKey) {
        return NextResponse.json(
          {
            ok: false,
            error: "forced_class_topic_mismatch",
            classId: forcedClassId,
            requestedTopicKey: topicKey,
            actualTopicKey: forcedTopic,
          },
          { status: 400 }
        );
      }

      targetClass = forcedClass;

      try {
        const found = await findAvailableFormingSession(
          forcedClassId,
          requestedCapacity
        );

        targetSession =
          found ?? (await createSession(forcedClassId, requestedCapacity));

        console.log("[class/match-join] forced class resolved =", {
          classId: forcedClassId,
          className: forcedClass.name,
          sessionId: targetSession.id,
          reused: Boolean(found),
        });
      } catch (e: any) {
        return NextResponse.json(
          {
            ok: false,
            error: foundSessionCreateErrorCode(e),
            detail: e?.message ?? String(e),
          },
          { status: 500 }
        );
      }
    } else {
      // B) classId 指定なし:
      //    従来どおり、テーマ内で最適な class/session を自動選択
      const orderedClasses = sortClassesForAutoMatch(
        sameTopicClasses,
        currentIds,
        preferJoinedClass
      );

      for (const c of orderedClasses) {
        const cid = String(c.id);

        try {
          const found = await findAvailableFormingSession(cid, requestedCapacity);
          if (found) {
            targetClass = c;
            targetSession = found;
            console.log("[class/match-join] using existing session =", {
              classId: cid,
              className: c.name,
              sessionId: found.id,
            });
            break;
          }
        } catch (e: any) {
          return NextResponse.json(
            {
              ok: false,
              error: "session_lookup_failed",
              detail: e?.message ?? String(e),
            },
            { status: 500 }
          );
        }
      }

      // 空き session がなければ新規 class + session 作成
      if (!targetClass) {
        const maxIndex = sameTopicClasses.reduce((max, c) => {
          return Math.max(max, extractIndexedClassNumber(c.name));
        }, 0);

        const nextIndex = maxIndex + 1;
        const numberedName = buildIndexedClassLabel(nextIndex);

        const { data: createdClass, error: createErr } = await supabase
          .from("classes")
          .insert({
            name: numberedName,
            description: "",
            world_key: worldKey,
            topic_key: topicKey,
            min_age: 0,
            is_sensitive: false,
            is_user_created: false,
          })
          .select("id,name,topic_key,world_key,created_at")
          .single();

        console.log("[class/match-join] created class =", createdClass);
        console.log("[class/match-join] create error =", createErr);

        if (createErr) {
          return NextResponse.json(
            {
              ok: false,
              error: "class_create_failed",
              detail: createErr.message,
              code: (createErr as any)?.code ?? null,
              hint: (createErr as any)?.hint ?? null,
              details: (createErr as any)?.details ?? null,
            },
            { status: 500 }
          );
        }

        targetClass = createdClass as ClassRow;

        try {
          targetSession = await createSession(
            String(targetClass.id),
            requestedCapacity
          );
          console.log("[class/match-join] created session on new class =", {
            classId: targetClass.id,
            sessionId: targetSession.id,
          });
        } catch (e: any) {
          return NextResponse.json(
            {
              ok: false,
              error: "session_create_failed",
              detail: e?.message ?? String(e),
            },
            { status: 500 }
          );
        }
      }
    }

    if (!targetClass?.id) {
      return NextResponse.json(
        { ok: false, error: "class_resolve_failed" },
        { status: 500 }
      );
    }

    if (!targetSession?.id) {
      return NextResponse.json(
        { ok: false, error: "session_resolve_failed" },
        { status: 500 }
      );
    }

    const classId = String(targetClass.id);
    const sessionId = String(targetSession.id);

    // 念のため最終防御
    if (String(targetSession.class_id) !== classId) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_class_mismatch",
          classId,
          sessionClassId: String(targetSession.class_id),
          sessionId,
        },
        { status: 500 }
      );
    }

    // membership
    const membershipRes = await ensureMembership({
      deviceId,
      classId,
      currentIds,
      classSlots,
    });
    if (!membershipRes.ok) return membershipRes.response;

    return NextResponse.json({
      ok: true,
      alreadyJoined: membershipRes.alreadyJoined,
      classId,
      sessionId,
      class: targetClass,
      session: targetSession,
      inserted: membershipRes.inserted,
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

function foundSessionCreateErrorCode(_e: unknown) {
  return "session_resolve_failed";
}