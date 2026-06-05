import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getBillableMembershipSnapshot, getClassSlotsForDevice } from "@/lib/classMembershipSlots";
import { formatPostgresError, postgresErrorBody } from "@/lib/postgresError";
import {
  blocksNewJoinSessionStatus,
  isRecruitingSessionStatus,
  isSessionEligibleForNormalJoin,
  parseOpenJoinedClassFlag,
} from "@/lib/recruitment";
import { getRecruitmentSessionTtlMinutes } from "@/lib/recruitmentSettings";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  ADMISSION_CLOSED_MESSAGE,
  canRejoinFromEligibility,
  loadRejoinEligibility,
} from "@/lib/admissionMembership";
import { getAdmissionStatus } from "@/lib/admissionWindow";
import { ensureClassSessionMembership } from "@/lib/ensureClassSessionMembership";
import type { JoinStateSource } from "@/lib/ensureClassSessionMembership";
import { tailJoinId } from "@/lib/joinStateInvariants";

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
    .select("id, class_id, status, capacity, topic, created_at")
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

  if (status === "closed" || status === "ended" || status === "expired") {
    console.log(
      `[room join] reject-closed-session session=${sessionId.slice(-6)} reason=${status}`
    );
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
      createdAt: data.created_at ?? null,
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
  openJoinedClass?: unknown;
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
    const openJoinedClass = parseOpenJoinedClassFlag(
      body.openJoinedClass ?? url.searchParams.get("openJoinedClass")
    );

    console.log("[session/join] request", {
      rawSessionCandidate,
      sessionId,
      requestedClassId,
      deviceId,
      name,
      invite,
      openJoinedClass,
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
    const recruitmentSessionTtlMinutes = await getRecruitmentSessionTtlMinutes();

    const rejoinEligibility = await loadRejoinEligibility({
      deviceId,
      classId: session.classId,
      sessionId,
    });
    const canRejoin = canRejoinFromEligibility(rejoinEligibility);

    if (invite) {
      console.log(
        `[admission] bypass reason=invite session=${sessionId.slice(-6)} ` +
          `class=${String(session.classId ?? "").slice(-6)} device=${deviceId.slice(-4)}`
      );
    } else if (canRejoin) {
      const rejoinReason = rejoinEligibility.existingClassMember
        ? "class_membership"
        : rejoinEligibility.existingSessionMember
          ? "session_member"
          : "unknown";
      console.log(
        `[admission] canRejoin=true reason=${rejoinReason} session=${sessionId.slice(-6)} ` +
          `device=${deviceId.slice(-4)}`
      );
    }

    if (!canRejoin && !invite) {
      const admission = await getAdmissionStatus();
      if (!admission.open) {
        console.log(
          `[admission] blocked reason=closed path=session_join session=${sessionId.slice(-6)} ` +
            `class=${String(session.classId ?? "").slice(-6)} device=${deviceId.slice(-4)}`
        );
        console.log("[session/join] admission_closed", {
          sessionId,
          classId: session.classId,
          deviceId,
        });

        return NextResponse.json(
          {
            ok: false,
            error: "admission_closed",
            admission,
            message: ADMISSION_CLOSED_MESSAGE,
          },
          { status: 403 }
        );
      }
    }

    await expireStaleRecruitmentSessions(supabaseAdmin, {
      classIds: session.classId ? [session.classId] : undefined,
      ttlMinutes: recruitmentSessionTtlMinutes,
    });

    if (blocksNewJoinSessionStatus(session.status) && !canRejoin) {
      const { data: existingSessionMemberRow, error: existingSessionMemberErr } =
        await supabaseAdmin
          .from("session_members")
          .select("device_id")
          .eq("session_id", sessionId)
          .eq("device_id", deviceId)
          .maybeSingle();

      if (existingSessionMemberErr) {
        console.log(
          "[session/join existingSessionMemberErr]",
          existingSessionMemberErr
        );
        return NextResponse.json(
          { ok: false, error: "session_member_check_failed" },
          { status: 500 }
        );
      }

      if (!existingSessionMemberRow) {
        console.log("[session/join] recruitment_closed", {
          sessionId,
          sessionStatus: session.status,
          openJoinedClass,
          canRejoin,
          deviceId,
          requestedClassId,
        });

        return NextResponse.json(
          {
            ok: false,
            error: "recruitment_closed",
            sessionStatus: session.status,
            sessionId,
            message: "このセッションは現在募集していません。",
          },
          { status: 403 }
        );
      }
    }

    if (
      !canRejoin &&
      isRecruitingSessionStatus(session.status) &&
      !isSessionEligibleForNormalJoin({
        sessionStatus: session.status,
        sessionCreatedAt: session.createdAt,
        recruitmentSessionTtlMinutes,
      })
    ) {
      console.log("[session/join] recruitment_closed stale session", {
        sessionId,
        sessionStatus: session.status,
        sessionCreatedAt: session.createdAt,
        recruitmentSessionTtlMinutes,
        openJoinedClass,
        canRejoin,
        deviceId,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "recruitment_closed",
          sessionStatus: session.status,
          sessionId,
          sessionCreatedAt: session.createdAt,
          recruitmentSessionTtlMinutes,
          message: "このセッションは募集時間外です。",
        },
        { status: 403 }
      );
    }

    const classId = session.classId;

    if (!classId || !isUuid(classId)) {
      return NextResponse.json(
        { ok: false, error: "session_class_missing" },
        { status: 400 }
      );
    }

    if (requestedClassId && requestedClassId !== classId) {
      console.warn(
        `[join-state] mismatch sessionClass=${tailJoinId(classId)} ` +
          `requestedClass=${tailJoinId(requestedClassId)} session=${tailJoinId(sessionId)}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: "session_class_mismatch",
          sessionClassId: classId,
          requestedClassId,
        },
        { status: 409 }
      );
    }

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
      const slotsRes = await getClassSlotsForDevice(supabaseAdmin, deviceId);
      if (!slotsRes.ok) {
        return NextResponse.json(
          { ok: false, error: "entitlement_check_failed", detail: slotsRes.error },
          { status: 500 }
        );
      }

      const classSlots = slotsRes.classSlots;

      const billableRes = await getBillableMembershipSnapshot(
        supabaseAdmin,
        deviceId
      );
      if (!billableRes.ok) {
        return NextResponse.json(
          { ok: false, error: "membership_count_failed", detail: billableRes.error },
          { status: 500 }
        );
      }

      if (billableRes.snapshot.billableCount >= classSlots) {
        console.log(
          `[match-join] reject class_slot_limit active=${billableRes.snapshot.billableCount} ` +
            `limit=${classSlots} class=${tailJoinId(classId)}`
        );
        return NextResponse.json(
          {
            ok: false,
            error: "class_slots_limit",
            message: "参加できるクラス数の上限に達しています。",
            currentCount: billableRes.snapshot.billableCount,
            totalMembershipCount: billableRes.snapshot.totalCount,
            legacyMembershipCount: billableRes.snapshot.legacyCount,
            classSlots,
          },
          { status: 403 }
        );
      }
    }

    let joinSource: JoinStateSource = "normal_join";
    if (invite) {
      joinSource = "invite";
    } else if (canRejoin) {
      joinSource = "rejoin";
    } else if (openJoinedClass) {
      joinSource = "restore";
    }

    const joinState = await ensureClassSessionMembership({
      classId,
      sessionId,
      deviceId,
      source: joinSource,
      displayName,
    });

    if (!joinState.ok) {
      const httpStatus =
        joinState.error === "session_class_mismatch"
          ? 409
          : joinState.status === "partial"
            ? 207
            : 500;

      if (joinState.error === "session_member_upsert_failed" && joinState.details?.[0]) {
        return NextResponse.json(
          postgresErrorBody("session_member_upsert_failed", {
            message: joinState.details[0],
          } as { message: string },
          { sessionId, deviceId }
        ),
          { status: httpStatus }
        );
      }

      return NextResponse.json(joinState, { status: httpStatus });
    }

    const { data: memberRows, count } = await supabaseAdmin
      .from("session_members")
      .select("device_id", { count: "exact" })
      .eq("session_id", sessionId);

    const memberIds = (memberRows ?? [])
      .map((row) => String(row.device_id ?? "").trim())
      .filter(Boolean)
      .map((id) => id.slice(-4))
      .join(",");

    console.log(
      `[session-members] context=session_join session=${sessionId.slice(-6)} ` +
        `count=${Number(count ?? 0)} ids=${memberIds || "-"} ` +
        `class=${classId.slice(-6)} device=${deviceId.slice(-4)} ` +
        `openJoinedClass=${openJoinedClass ? 1 : 0} source=${joinSource}`
    );

    return NextResponse.json({
      ok: true,
      sessionId,
      classId,
      status: session.status,
      capacity: session.capacity,
      memberCount: Number(count ?? 0),
      alreadyInSession: false,
      joinState,
    });
  } catch (e: unknown) {
    console.error("[session/join server_error]", e);

    return NextResponse.json(
      { ok: false, error: "server_error", detail: errorDetail(e) },
      { status: 500 }
    );
  }
}