import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatPostgresError, postgresErrorBody } from "@/lib/postgresError";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

function extractUuid(v: unknown) {
  const s = String(v ?? "").trim();
  const m = s.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );
  return m?.[0] ?? "";
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeDisplayName(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s || s === "You" || s === "undefined" || s === "null") return "参加者";
  return s;
}

async function ensureJoinableSession(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("id, class_id, status, capacity, topic")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      error: "session_lookup_failed",
      detail: error.message,
    };
  }

  if (!data) {
    return { ok: false as const, error: "session_not_found" };
  }

  const status = String(data.status ?? "forming");

  if (status === "closed" || status === "ended") {
    return { ok: false as const, error: "session_closed" };
  }

  return {
    ok: true as const,
    session: {
      id: String(data.id),
      classId: String(data.class_id ?? "").trim(),
      status,
      capacity: Number(data.capacity ?? 5),
      topic: String(data.topic ?? "").trim(),
    },
  };
}

type JoinBody = {
  sessionId?: unknown;
  session_id?: unknown;
  session?: unknown;
  sessionID?: unknown;
  roomSessionId?: unknown;
  session_id_raw?: unknown;
  classId?: unknown;
  class_id?: unknown;
  class?: unknown;
  deviceId?: unknown;
  device_id?: unknown;
  name?: unknown;
  displayName?: unknown;
  display_name?: unknown;
  invite?: unknown;
};

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as JoinBody;

    const rawSessionCandidate =
      [
        url.searchParams.get("sessionId"),
        url.searchParams.get("session_id"),
        url.searchParams.get("session"),
        body.sessionId,
        body.session_id,
        body.session,
        body.sessionID,
        body.roomSessionId,
        body.session_id_raw,
      ]
        .map((v) => String(v ?? "").trim())
        .find((v) => v.length > 0) || "";

    const rawClassCandidate =
      [
        url.searchParams.get("classId"),
        url.searchParams.get("class_id"),
        url.searchParams.get("class"),
        body.classId,
        body.class_id,
        body.class,
      ]
        .map((v) => String(v ?? "").trim())
        .find((v) => v.length > 0) || "";

    const sessionId = extractUuid(rawSessionCandidate);
    const requestedClassId = extractUuid(rawClassCandidate);

    const deviceId = String(
      body.deviceId ??
        body.device_id ??
        url.searchParams.get("deviceId") ??
        url.searchParams.get("device_id") ??
        ""
    ).trim();

    const name = sanitizeDisplayName(
      body.name ??
        body.displayName ??
        body.display_name ??
        url.searchParams.get("name") ??
        url.searchParams.get("displayName")
    );

    const invite = Boolean(body.invite);

    console.log("[session/join]", {
      rawSessionCandidate,
      sessionId,
      requestedClassId,
      deviceId,
      name,
      invite,
    });

    if (!sessionId || !isUuid(sessionId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_sessionId" },
        { status: 400 }
      );
    }

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "deviceId required" },
        { status: 400 }
      );
    }

    const ensured = await ensureJoinableSession(sessionId);

    if (!ensured.ok) {
      console.log("[session/join ensured failed]", ensured);

      return NextResponse.json(
        { ok: false, error: ensured.error, detail: ensured.detail ?? null },
        { status: 400 }
      );
    }

    const session = ensured.session;

    // ✅ session_members が真実。
    // 招待リンク側の classId が古い/ズレていても、session.class_id を正として補正する。
    const classId = session.classId || requestedClassId;

    if (!classId || !isUuid(classId)) {
      return NextResponse.json(
        { ok: false, error: "session_class_missing" },
        { status: 400 }
      );
    }

    if (requestedClassId && session.classId && requestedClassId !== session.classId) {
      console.warn("[session/join class mismatch ignored]", {
        requestedClassId,
        sessionClassId: session.classId,
        usingClassId: classId,
        invite,
      });
    }

    const now = new Date().toISOString();

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("user_profiles")
      .select("display_name")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (profileErr) {
      console.log("[session/join profileErr]", profileErr);
      return NextResponse.json(
        { ok: false, error: "profile_lookup_failed" },
        { status: 500 }
      );
    }

    const displayName =
      String(profile?.display_name ?? "").trim() ||
      sanitizeDisplayName(
        body.name ??
          body.displayName ??
          body.display_name ??
          url.searchParams.get("name") ??
          url.searchParams.get("displayName")
      );

    console.log("[session/join displayName]", { deviceId, displayName });

        // ✅ クラス所属上限チェック
    // すでにこのクラスに入っている場合はOK。
    // 新しく別クラスへ参加する場合だけ class_slots を確認する。
    const { data: existingMembership, error: existingMembershipErr } =
      await supabaseAdmin
        .from("class_memberships")
        .select("class_id")
        .eq("class_id", classId)
        .eq("device_id", deviceId)
        .maybeSingle();

    if (existingMembershipErr) {
      console.log("[session/join existingMembershipErr]", existingMembershipErr);
      return NextResponse.json(
        { ok: false, error: "membership_check_failed" },
        { status: 500 }
      );
    }

    if (!existingMembership) {
      const { data: entitlement, error: entitlementErr } = await supabaseAdmin
        .from("user_entitlements")
        .select("class_slots")
        .eq("device_id", deviceId)
        .maybeSingle();

      if (entitlementErr) {
        console.log("[session/join entitlementErr]", entitlementErr);
        return NextResponse.json(
          { ok: false, error: "entitlement_check_failed" },
          { status: 500 }
        );
      }

      const classSlots = Number(entitlement?.class_slots ?? 1);

      const { count: activeClassCount, error: countErr } = await supabaseAdmin
        .from("class_memberships")
        .select("*", { count: "exact", head: true })
        .eq("device_id", deviceId);

      if (countErr) {
        console.log("[session/join activeClassCountErr]", countErr);
        return NextResponse.json(
          { ok: false, error: "membership_count_failed" },
          { status: 500 }
        );
      }

      if (Number(activeClassCount ?? 0) >= classSlots) {
        return NextResponse.json(
          {
            ok: false,
            error: "class_slots_limit",
            message: "参加できるクラス数の上限に達しています。",
          },
          { status: 403 }
        );
      }
    }

    const { error: memberErr } = await supabaseAdmin
      .from("session_members")
      .upsert(
        {
          session_id: sessionId,
          device_id: deviceId,
          display_name: displayName,
          joined_at: now,
        },
        { onConflict: "session_id,device_id" }
      );

    if (memberErr) {
      console.error("[session/join] session_member_upsert_failed", {
        sessionId,
        deviceId,
        displayName,
        ...formatPostgresError(memberErr),
      });

      return NextResponse.json(
        postgresErrorBody("session_member_upsert_failed", memberErr, {
          sessionId,
          deviceId,
        }),
        { status: 500 }
      );
    }

    // ✅ ホーム表示用の所属を必ず補正
    const { error: membershipErr } = await supabaseAdmin
      .from("class_memberships")
      .upsert(
        {
          class_id: classId,
          device_id: deviceId,
          joined_at: now,
        },
        { onConflict: "class_id,device_id" }
      );

    if (membershipErr) {
      console.log("[session/join membershipErr]", membershipErr);
    }

    // ✅ オンライン表示用のpresenceも同じclassIdにそろえる
    const { error: presenceErr } = await supabaseAdmin
      .from("class_presence")
      .upsert(
        {
          class_id: classId,
          device_id: deviceId,
          session_id: sessionId,
          status: session.status === "active" ? "active" : "waiting",
          updated_at: now,
        },
        { onConflict: "class_id,device_id" }
      );

    if (presenceErr) {
      console.log("[session/join presenceErr]", presenceErr);
    }

    const { count } = await supabaseAdmin
      .from("session_members")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);

    return NextResponse.json({
      ok: true,
      sessionId,
      classId,
      status: session.status,
      capacity: session.capacity,
      memberCount: Number(count ?? 0),
      alreadyInSession: false,
    });
  } catch (e: unknown) {
    console.error("[session/join server_error]", e);

    return NextResponse.json(
      { ok: false, error: "server_error", detail: errorDetail(e) },
      { status: 500 }
    );
  }
}