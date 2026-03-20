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

function buildBaseName(topicKey: string | null) {
  if (!topicKey) return "フリークラス";
  if (topicKey === "woman") return "女子校";
  if (topicKey === "man") return "男子校";
  return `${topicKey}ルーム`;
}

function isLegacyEntryClassName(name: string | null | undefined) {
  const s = String(name ?? "").trim();
  return LEGACY_ENTRY_NAMES.has(s);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body.deviceId ?? "").trim();
    const worldKey = String(body.worldKey ?? "default").trim() || "default";
    const topicKey = normalizeTopicKey(body.topicKey);
    const requestedCapacity = Math.max(2, Number(body.capacity ?? 5) || 5);
    const preferJoinedClass = Boolean(body.preferJoinedClass ?? true);

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

    console.log("[class/match-join] profile =", profile);
    console.log("[class/match-join] profile error =", profileErr);

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

    const allSameTopicClasses = classesResult.data ?? [];
    const sameTopicClasses = allSameTopicClasses.filter((c: any) => {
      return !isLegacyEntryClassName(c?.name);
    });

    console.log("[class/match-join] all same-topic classes =", allSameTopicClasses);
    console.log("[class/match-join] filtered instance classes =", sameTopicClasses);
    console.log("[class/match-join] currentIds =", currentIds);

    let targetClass: any = null;

    // 4) preferJoinedClass=true のときだけ、既存所属の同テーマ class を優先
    if (preferJoinedClass) {
      for (const c of sameTopicClasses) {
        const cid = String(c.id);
        if (currentIds.includes(cid)) {
          targetClass = c;
          console.log("[class/match-join] reusing joined class =", c);
          break;
        }
      }
    }

    // 5) 空きのある class を探す
    if (!targetClass) {
      for (const c of sameTopicClasses) {
        const cid = String(c.id);

        if (!preferJoinedClass && currentIds.includes(cid)) {
          console.log("[class/match-join] skip already joined class =", c);
          continue;
        }

        const { count, error: countErr } = await supabase
          .from("class_memberships")
          .select("*", { count: "exact", head: true })
          .eq("class_id", c.id);

        if (countErr) {
          return NextResponse.json(
            {
              ok: false,
              error: "member_count_failed",
              detail: countErr.message,
            },
            { status: 500 }
          );
        }

        const memberCount = Number(count ?? 0);
        console.log("[class/match-join] class memberCount =", {
          classId: cid,
          name: c.name,
          memberCount,
          requestedCapacity,
        });

        if (memberCount < requestedCapacity) {
          targetClass = c;
          console.log("[class/match-join] using existing class =", c);
          break;
        }
      }
    }

    // 6) 無ければ新規作成
    if (!targetClass) {
      const baseName = buildBaseName(topicKey);
      const classNumber = sameTopicClasses.length + 1;

      const numberedName =
        topicKey === "woman" || topicKey === "man" || topicKey === null
          ? `${baseName} ${classNumber}組`
          : `${baseName} ${classNumber}`;

      const { data: created, error: createErr } = await supabase
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
        .maybeSingle();

      console.log("[class/match-join] created class =", created);
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

      targetClass = created;
    }

    if (!targetClass?.id) {
      return NextResponse.json(
        { ok: false, error: "class_resolve_failed" },
        { status: 500 }
      );
    }

    const classId = String(targetClass.id);

    // 7) 既にその class に所属済みなら、そのまま返す
    if (currentIds.includes(classId)) {
      return NextResponse.json({
        ok: true,
        alreadyJoined: true,
        classId,
        class: targetClass,
      });
    }

    // 8) 新規 membership を足すときだけ slots を判定
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
      class: targetClass,
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