// app/api/class/quick-join/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body.deviceId ?? "").trim();
    const requestedTopicKey = String(body.topicKey ?? "free").trim();
    const worldKeyRaw = String(body.worldKey ?? "default").trim();
    const worldKey = worldKeyRaw || "default";

    // free は topic_key = null で扱う
    const isFree = requestedTopicKey === "free" || requestedTopicKey === "";
    const topicKey: string | null = isFree ? null : requestedTopicKey;

    console.log("[class/quick-join] body =", body);
    console.log("[class/quick-join] deviceId =", deviceId);
    console.log("[class/quick-join] requestedTopicKey =", requestedTopicKey);
    console.log("[class/quick-join] normalized topicKey =", topicKey);
    console.log("[class/quick-join] worldKey =", worldKey);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    // 1) entitlement 取得
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

    // 2) 既存 membership
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

    // 3) 対象クラスを探す
    let cls: any = null;
    let clsErr: any = null;

    if (isFree) {
      const result = await supabase
        .from("classes")
        .select("id,name,topic_key,world_key,created_at")
        .is("topic_key", null)
        .eq("world_key", worldKey)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      cls = result.data;
      clsErr = result.error;
    } else {
      const result = await supabase
        .from("classes")
        .select("id,name,topic_key,world_key,created_at")
        .eq("topic_key", topicKey)
        .eq("world_key", worldKey)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      cls = result.data;
      clsErr = result.error;
    }

    console.log("[class/quick-join] class lookup cls =", cls);
    console.log("[class/quick-join] class lookup error =", clsErr);

    if (clsErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_lookup_failed",
          detail: clsErr.message,
        },
        { status: 500 }
      );
    }

    // 4) なければ作る
    if (!cls) {
      const fallbackName = isFree ? "フリークラス" : `${topicKey}ルーム`;

      const { data: created, error: createErr } = await supabase
        .from("classes")
        .insert({
          name: fallbackName,
          description: "",
          world_key: worldKey,
          topic_key: topicKey, // free のときは null
          min_age: 0,
          is_sensitive: false,
          is_user_created: false,
        })
        .select("id,name,topic_key,world_key,created_at")
        .maybeSingle();

      console.log("[class/quick-join] created class =", created);
      console.log("[class/quick-join] create error =", createErr);

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

      cls = created;
    }

    if (!cls?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_resolve_failed",
        },
        { status: 500 }
      );
    }

    const classId = String(cls.id);

    // 5) 既にそのクラスに所属済みならそのまま返す
    if (currentIds.includes(classId)) {
      return NextResponse.json({
        ok: true,
        alreadyJoined: true,
        classId,
        class: cls,
      });
    }

    // 6) 総枠数だけ制限
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

    // 7) membership 追加
    const { data: inserted, error: insErr } = await supabase
      .from("class_memberships")
      .insert({
        device_id: deviceId,
        class_id: classId,
      })
      .select("device_id,class_id");

    console.log("[class/quick-join] inserted =", inserted);
    console.log("[class/quick-join] insert error =", insErr);

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
      class: cls,
      inserted: inserted ?? [],
    });
  } catch (e: any) {
    console.error("[class/quick-join] server error =", e);
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