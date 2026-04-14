import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const deviceId =
      url.searchParams.get("deviceId") ||
      req.headers.get("x-device-id") ||
      "";

    const normalizedDeviceId = String(deviceId).trim();

    console.log("[class/mine] raw deviceId =", deviceId);
    console.log("[class/mine] normalizedDeviceId =", normalizedDeviceId);

    if (!normalizedDeviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    // 1) class_memberships を取得
    const { data: memberships, error: membershipsErr } = await supabaseAdmin
      .from("class_memberships")
      .select("class_id")
      .eq("device_id", normalizedDeviceId);

    console.log("[class/mine] memberships error =", membershipsErr);
    console.log("[class/mine] memberships data =", memberships);

    if (membershipsErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_mine_membership_failed",
          detail: membershipsErr.message,
        },
        { status: 500 }
      );
    }

    const classIds = (memberships ?? [])
      .map((row: any) => String(row.class_id ?? "").trim())
      .filter(Boolean);

    if (classIds.length === 0) {
      return NextResponse.json({
        ok: true,
        classes: [],
        debug: {
          membershipCount: 0,
          classRowCount: 0,
          joinFailedCount: 0,
          legacyFilteredCount: 0,
        },
      });
    }

    // 2) classes を別取得
    const { data: classRows, error: classesErr } = await supabaseAdmin
      .from("classes")
      .select(
        `
        id,
        name,
        description,
        world_key,
        topic_key,
        min_age,
        is_sensitive,
        is_user_created,
        created_at
      `
      )
      .in("id", classIds);

    console.log("[class/mine] classes error =", classesErr);
    console.log("[class/mine] classes data =", classRows);

    if (classesErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_mine_classes_failed",
          detail: classesErr.message,
        },
        { status: 500 }
      );
    }

    const classMap = new Map(
      (classRows ?? []).map((c: any) => [String(c.id).trim(), c])
    );

    // 3) merge
    const merged = classIds.map((classId) => {
      const c = classMap.get(classId);

      return {
        class_id: classId,
        join_ok: Boolean(c?.id),
        id: c?.id ?? classId,
        name: c?.name ?? "(class not found)",
        description: c?.description ?? "",
        world_key: c?.world_key ?? null,
        topic_key: c?.topic_key ?? null,
        min_age: Number(c?.min_age ?? 0),
        is_sensitive: Boolean(c?.is_sensitive),
        is_user_created: Boolean(c?.is_user_created),
        created_at: c?.created_at ?? null,
      };
    });

    // 4) レガシー入口クラスを除外
    const classes = merged.filter((c: any) => !isLegacyEntryClassName(c?.name));
    const legacyFilteredCount = merged.length - classes.length;

    console.log("[class/mine] merged classes =", merged);
    console.log("[class/mine] filtered classes =", classes);
    console.log("[class/mine] legacyFilteredCount =", legacyFilteredCount);

    return NextResponse.json({
      ok: true,
      classes,
      debug: {
        membershipCount: memberships?.length ?? 0,
        classRowCount: classRows?.length ?? 0,
        joinFailedCount: classes.filter((c: any) => !c.join_ok).length,
        legacyFilteredCount,
      },
    });
  } catch (e: any) {
    console.error("[class/mine] internal error =", e);

    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        detail: e?.message ?? "unknown_error",
      },
      { status: 500 }
    );
  }
}