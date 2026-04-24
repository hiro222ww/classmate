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

    // 1) class_memberships を取得（所属一覧）
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

    const classIds = Array.from(
  new Set(
    (memberships ?? [])
      .map((row: any) => String(row.class_id ?? "").trim())
      .filter(Boolean)
  )
);

    if (classIds.length === 0) {
      return NextResponse.json({
        ok: true,
        classes: [],
        debug: {
          membershipCount: 0,
          classRowCount: 0,
          topicRowCount: 0,
          sessionRowCount: 0,
          joinFailedCount: 0,
          legacyFilteredCount: 0,
        },
      });
    }

    // 2) classes を取得（deadlineは表示用に持つが、絞り込みには使わない）
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
        created_at,
        match_deadline_at
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

    // 3) topic_key 一覧を抽出
    const topicKeys = Array.from(
      new Set(
        (classRows ?? [])
          .map((c: any) => String(c.topic_key ?? "").trim())
          .filter(Boolean)
      )
    );

    // 4) topics を別取得
    let topicRows: any[] = [];
    if (topicKeys.length > 0) {
      const { data: topicsData, error: topicsErr } = await supabaseAdmin
        .from("topics")
        .select("topic_key,title,description")
        .in("topic_key", topicKeys);

      console.log("[class/mine] topics error =", topicsErr);
      console.log("[class/mine] topics data =", topicsData);

      if (topicsErr) {
        return NextResponse.json(
          {
            ok: false,
            error: "class_mine_topics_failed",
            detail: topicsErr.message,
          },
          { status: 500 }
        );
      }

      topicRows = topicsData ?? [];
    }

    const topicMap = new Map(
      topicRows.map((t: any) => [String(t.topic_key).trim(), t])
    );

    // 5) sessions を取得（状態表示用）
    const { data: sessionRows, error: sessionsErr } = await supabaseAdmin
      .from("sessions")
      .select("id,class_id,status,created_at")
      .in("class_id", classIds)
      .in("status", ["forming", "waiting", "active"]);

    console.log("[class/mine] sessions error =", sessionsErr);
    console.log("[class/mine] sessions data =", sessionRows);

    if (sessionsErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_mine_sessions_failed",
          detail: sessionsErr.message,
        },
        { status: 500 }
      );
    }

    const sessionMap = new Map<
      string,
      { id: string; status: string; created_at: string | null }
    >();

    for (const row of sessionRows ?? []) {
      const classId = String((row as any)?.class_id ?? "").trim();
      if (!classId) continue;

      const current = sessionMap.get(classId);
      const nextCreatedAt = String((row as any)?.created_at ?? "").trim() || "";
      const currentCreatedAt = String(current?.created_at ?? "").trim() || "";

      if (!current || nextCreatedAt > currentCreatedAt) {
        sessionMap.set(classId, {
          id: String((row as any)?.id ?? "").trim(),
          status: String((row as any)?.status ?? "").trim(),
          created_at: (row as any)?.created_at ?? null,
        });
      }
    }

    // 6) merge
    const merged = classIds.map((classId) => {
      const c = classMap.get(classId);
      const topicKey = String(c?.topic_key ?? "").trim();
      const topic = topicKey ? topicMap.get(topicKey) : null;
      const session = sessionMap.get(classId);

      return {
        class_id: classId,
        join_ok: Boolean(c?.id),
        id: c?.id ?? classId,
        name: c?.name ?? "(class not found)",
        description: c?.description ?? "",
        world_key: c?.world_key ?? null,
        topic_key: c?.topic_key ?? null,
        topic_title: topic?.title ?? null,
        topic_description: topic?.description ?? null,
        min_age: Number(c?.min_age ?? 0),
        is_sensitive: Boolean(c?.is_sensitive),
        is_user_created: Boolean(c?.is_user_created),
        created_at: c?.created_at ?? null,
        match_deadline_at: c?.match_deadline_at ?? null,
        has_active_session: Boolean(session?.id),
        session_id: session?.id ?? null,
        session_status: session?.status ?? null,
        session_created_at: session?.created_at ?? null,
      };
    });

    // 7) レガシー入口クラスだけ除外
    const classes = merged.filter(
      (c: any) => !isLegacyEntryClassName(c?.name)
    );
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
        topicRowCount: topicRows?.length ?? 0,
        sessionRowCount: sessionRows?.length ?? 0,
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