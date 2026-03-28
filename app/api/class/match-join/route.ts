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

async function createSession(classId: string): Promise<SessionRow> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      class_id: classId,
      status: "forming",
      capacity: 5,
    })
    .select("id,class_id,status,created_at")
    .single();

  if (error) throw error;
  return data as SessionRow;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body.deviceId ?? "").trim();
    const worldKey = String(body.worldKey ?? "default").trim() || "default";
    const topicKey = normalizeTopicKey(body.topicKey);
    const requestedCapacity = Math.max(2, Number(body.capacity ?? 5) || 5);
    const preferJoinedClass = Boolean(body.preferJoinedClass ?? false);

    console.log("[class/match-join] body =", body);
    console.log("[class/match-join] deviceId =", deviceId);
    console.log("[class/match-join] topicKey =", topicKey);
    console.log("[class/match-join] worldKey =", worldKey);
    console.log("[class/match-join] requestedCapacity =", requestedCapacity);
    console.log("[class/match-join] preferJoinedClass =", preferJoinedClass);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    // 0) プロフィール存在チェック
    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("device_id")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "profile_lookup_failed",
          detail: profileErr.message,
        },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          ok: false,
          error: "profile_required",
        },
        { status: 400 }
      );
    }

    // 1) entitlement
    const { data: ent, error: entErr } = await supabase
      .from("user_entitlements")
      .select("class_slots")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (entErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "entitlements_lookup_failed",
          detail: entErr.message,
        },
        { status: 500 }
      );
    }

    const classSlots = Math.max(1, Number(ent?.class_slots ?? 1));

    // 2) 現在所属
    const { data: mine, error: mineErr } = await supabase
      .from("class_memberships")
      .select("class_id")
      .eq("device_id", deviceId);

    if (mineErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "memberships_lookup_failed",
          detail: mineErr.message,
        },
        { status: 500 }
      );
    }

    const currentIds = (mine ?? [])
      .map((x: any) => String(x.class_id ?? "").trim())
      .filter(Boolean);

    // 3) 同テーマの class 一覧を取得
    let classesQuery = supabase
      .from("classes")
      .select("id,name,topic_key,world_key,created_at")
      .eq("world_key", worldKey)
      .eq("is_user_created", false)
      .order("created_at", { ascending: true });

    const classesResult = topicKey
      ? await classesQuery.eq("topic_key", topicKey)
      : await classesQuery.is("topic_key", null);

    if (classesResult.error) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_lookup_failed",
          detail: classesResult.error.message,
        },
        { status: 500 }
      );
    }

    const allSameTopicClasses = (classesResult.data ?? []) as ClassRow[];

    // 旧入口名クラスを除外
    const sameTopicClasses = allSameTopicClasses.filter((c) => {
      return !isLegacyEntryClassName(c?.name);
    });

    console.log("[class/match-join] all same-topic classes =", allSameTopicClasses);
    console.log("[class/match-join] filtered instance classes =", sameTopicClasses);
    console.log("[class/match-join] currentIds =", currentIds);

    // 4) 探索順
    const orderedClasses = [...sameTopicClasses].sort((a, b) => {
      const aJoined = currentIds.includes(String(a.id)) ? 1 : 0;
      const bJoined = currentIds.includes(String(b.id)) ? 1 : 0;

      if (preferJoinedClass) {
        return bJoined - aJoined;
      }

      return aJoined - bJoined;
    });

    let targetClass: ClassRow | null = null;
    let targetSession: SessionRow | null = null;

    // 5) まず既存 class の中から空いてる forming session を探す
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

    // 6) 空き session がなければ、既存 class に追加せず新規 class を作る
    if (!targetClass) {
      const classNumber = sameTopicClasses.length + 1;
      const numberedName = buildIndexedClassLabel(classNumber);

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
        targetSession = await createSession(String(targetClass.id));
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

    // 7) 既にその class に所属済みなら membership は追加せず返す
    if (currentIds.includes(classId)) {
      return NextResponse.json({
        ok: true,
        alreadyJoined: true,
        classId,
        sessionId,
        class: targetClass,
        session: targetSession,
      });
    }

    // 8) 新規 membership を足すときだけ slots 判定
    if (currentIds.length >= classSlots) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: currentIds.length,
          classSlots,
        },
        { status: 400 }
      );
    }

    // 9) membership 追加
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
      return NextResponse.json(
        {
          ok: false,
          error: "membership_insert_failed",
          detail: insErr.message,
          code: (insErr as any)?.code ?? null,
          hint: (insErr as any)?.hint ?? null,
          details: (insErr as any)?.details ?? null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      classId,
      sessionId,
      class: targetClass,
      session: targetSession,
      inserted: inserted ?? [],
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