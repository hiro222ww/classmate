// app/api/class/join/route.ts
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
    const classId = String(body.classId ?? "").trim();

    console.log("[class/join] body =", body);
    console.log("[class/join] deviceId =", deviceId);
    console.log("[class/join] classId =", classId);

    if (!deviceId || !classId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_fields",
          deviceId,
          classId,
        },
        { status: 400 }
      );
    }

    // 1) クラス実在確認
    const { data: cls, error: clsErr } = await supabase
      .from("classes")
      .select("id,name,topic_key,world_key,created_at")
      .eq("id", classId)
      .maybeSingle();

    console.log("[class/join] classes lookup cls =", cls);
    console.log("[class/join] classes lookup error =", clsErr);

    if (clsErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_error",
          where: "classes_lookup",
          detail: clsErr.message,
        },
        { status: 500 }
      );
    }

    if (!cls) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_not_found",
          classId,
        },
        { status: 404 }
      );
    }

    // 2) entitlement 取得
    const { data: ent, error: entErr } = await supabase
      .from("user_entitlements")
      .select("class_slots, topic_plan, theme_pass")
      .eq("device_id", deviceId)
      .maybeSingle();

    console.log("[class/join] entitlements =", ent);
    console.log("[class/join] entitlements error =", entErr);

    if (entErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_error",
          where: "entitlements_lookup",
          detail: entErr.message,
        },
        { status: 500 }
      );
    }

    const classSlots = Math.max(1, Number(ent?.class_slots ?? 1));
    console.log("[class/join] classSlots =", classSlots);

    // 3) 現在の所属一覧
    const { data: mine, error: mineErr } = await supabase
      .from("class_memberships")
      .select("class_id")
      .eq("device_id", deviceId);

    console.log("[class/join] existing memberships =", mine);
    console.log("[class/join] memberships lookup error =", mineErr);

    if (mineErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_error",
          where: "memberships_lookup",
          detail: mineErr.message,
        },
        { status: 500 }
      );
    }

    const currentIds = (mine ?? [])
      .map((x: any) => String(x.class_id ?? "").trim())
      .filter(Boolean);

    console.log("[class/join] currentIds =", currentIds);

    // 同一 class_id のみ重複禁止
    if (currentIds.includes(classId)) {
      console.log("[class/join] already joined");
      return NextResponse.json({
        ok: true,
        alreadyJoined: true,
        class: cls,
        memberships: currentIds,
      });
    }

    // 総枠数だけ制限
    if (currentIds.length >= classSlots) {
      console.log("[class/join] class slots limit", {
        current: currentIds.length,
        limit: classSlots,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: currentIds.length,
          classSlots,
          detail: `current=${currentIds.length}, limit=${classSlots}`,
        },
        { status: 400 }
      );
    }

    // 4) insert
    const { data: inserted, error: insErr } = await supabase
      .from("class_memberships")
      .insert({
        device_id: deviceId,
        class_id: classId,
      })
      .select("device_id,class_id");

    console.log("[class/join] inserted =", inserted);
    console.log("[class/join] insert error =", insErr);

    if (insErr) {
      console.error("[class/join] insert full error =", insErr);

      return NextResponse.json(
        {
          ok: false,
          error: "join_failed",
          detail: insErr.message,
          code: (insErr as any)?.code ?? null,
          hint: (insErr as any)?.hint ?? null,
          details: (insErr as any)?.details ?? null,
          class: cls,
        },
        { status: 500 }
      );
    }

    // 5) verify
    const { data: verifyRows, error: verifyErr } = await supabase
      .from("class_memberships")
      .select("device_id,class_id")
      .eq("device_id", deviceId);

    console.log("[class/join] verify rows =", verifyRows);
    console.log("[class/join] verify error =", verifyErr);

    return NextResponse.json({
      ok: true,
      class: cls,
      inserted: inserted ?? [],
      memberships: verifyRows ?? [],
      verifyError: verifyErr?.message ?? null,
    });
  } catch (e: any) {
    console.error("[class/join] server error =", e);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}