import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LEGACY_ENTRY_NAMES = new Set([
  "女子校",
  "男子校",
  "フリークラス",
  "ホームルーム",
]);

function normalizeTopicKey(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "free") return null;
  return s;
}

function isLegacyEntryClassName(name: string | null | undefined) {
  const s = String(name ?? "").trim();
  return LEGACY_ENTRY_NAMES.has(s);
}

function buildIndexedClassLabel(n: number) {
  const safe = Math.max(1, Math.floor(n));
  const block = Math.floor((safe - 1) / 26) + 1; // 1,2,3...
  const letterIndex = (safe - 1) % 26; // 0..25
  const letter = String.fromCharCode(65 + letterIndex); // A..Z
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
  const { count, error } = await supabase
    .from("session_members")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (error) throw error;
  return Number(count ?? 0);
}

async function findAvailableFormingSession(
  classId: string,
  requestedCapacity: number
): Promise<SessionRow | null> {
  // status は環境によって "forming" / "waiting" など揺れる可能性があるので、
  // ひとまず forming を優先し、なければ waiting も見る。
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id,class_id,status,created_at")
    .eq("class_id", classId)
    .in("status", ["forming", "waiting"])
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = (sessions ?? []) as SessionRow[];

  // なるべく人がいる session を埋めるため、
  // 「空いてる中で memberCount が最大」のものを採用
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

    // 旧エントリ名は除外
    const sameTopicClasses = allSameTopicClasses.filter((c) => {
      return !isLegacyEntryClassName(c?.name);
    });

    console.log("[class/match-join] all same-topic classes =", allSameTopicClasses);
    console.log("[class/match-join] filtered instance classes =", sameTopicClasses);
    console.log("[class/match-join] currentIds =", currentIds);

    // 4) class探索順を決める
    // preferJoinedClass=true の時だけ「すでに joined 済み class」を前に出す
    const orderedClasses = [...sameTopicClasses].sort((a, b) => {
      const aJoined = currentIds.includes(String(a.id)) ? 1 : 0;
      const bJoined = currentIds.includes(String(b.id)) ? 1 : 0;

      if (preferJoinedClass) {
        return bJoined - aJoined; // joined済みを優先
      }

      return aJoined - bJoined; // joined済みは後ろ
    });

    let targetClass: ClassRow | null = null;
    let targetSession: SessionRow | null = null;

    // 5) まず、既存 class の中から「空いてる forming session」を探す
    for (const c of orderedClasses) {
      const cid = String(c.id);

      // preferJoinedClass=false のときは joined済み class は後ろに回してるだけで、
      // 完全に除外はしない。
      // ただし slots 制限に引っかかるケースでは、後段の membership 判定で守る。
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

    // 6) 空きforming sessionがなければ、既存 class に新しい session を作る
    // まずは joined 済みでない class を優先。なければ joined 済み class でも可。
    if (!targetClass) {
      const classForNewSession =
        orderedClasses.find((c) => !currentIds.includes(String(c.id))) ??
        orderedClasses[0] ??
        null;

      if (classForNewSession) {
        try {
          targetClass = classForNewSession;
          targetSession = await createSession(String(classForNewSession.id));

          console.log("[class/match-join] created new session on existing class =", {
            classId: targetClass.id,
            className: targetClass.name,
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

    // 7) それでも class が無ければ新規 class 作成 + session 作成
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

    // 8) 既にその class に所属済みなら membership は追加せずそのまま返す
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

    // 9) 新規 membership を足すときだけ slots 判定
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

    // 10) membership 追加
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