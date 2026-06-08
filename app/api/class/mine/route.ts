import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  buildHomeClassVisibilityDebug,
  resolveHomeVisibleBillableClassIds,
} from "@/lib/activeClassMemberships";
import { getHomeClassSlotContext } from "@/lib/classMembershipSlots";
import {
  getClassStatusLabel,
  isDeadlinePassed,
} from "@/lib/recruitment";
import {
  listClassSessionsWithMembers,
  pickCanonicalOpenJoinedSession,
  logClassSessionsDebug,
} from "@/lib/classSessionSelection";
import { formatClassSessionSelectionReason } from "@/lib/openJoinedClassSession";
import { getRecruitmentSessionTtlMinutes, getRecruitmentSessionTtlSetting } from "@/lib/recruitmentSettings";
import { fetchActiveMeetingPlansForClasses } from "@/lib/meetingPlan";
import { fetchActiveCallRequestsForClasses } from "@/lib/callRequest";
import { fetchUnreadCountsForClasses } from "@/lib/classMessageReads";

export const dynamic = "force-dynamic";

function tailId(id: string | null | undefined) {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  return value.length <= 6 ? value : value.slice(-6);
}

function resolveMembershipStatusLabel(params: {
  hasActiveSession: boolean;
  sessionStatus: string | null;
  matchDeadlineAt: string | null;
  sessionCreatedAt: string | null;
  recruitmentSessionTtlMinutes: number | null;
}): string {
  if (params.hasActiveSession && params.sessionStatus) {
    return getClassStatusLabel({
      sessionStatus: params.sessionStatus,
      matchDeadlineAt: params.matchDeadlineAt,
      hasActiveSession: true,
      sessionCreatedAt: params.sessionCreatedAt,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
    });
  }

  if (isDeadlinePassed(params.matchDeadlineAt)) {
    return "募集締切";
  }

  return "所属中";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const deviceId =
      url.searchParams.get("deviceId") ||
      req.headers.get("x-device-id") ||
      "";

    const normalizedDeviceId = String(deviceId).trim();
    const debugMemberships = url.searchParams.get("debugMemberships") === "1";

    if (!normalizedDeviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    const slotCtxRes = await getHomeClassSlotContext(
      supabaseAdmin,
      normalizedDeviceId
    );

    if (!slotCtxRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_mine_membership_failed",
          detail: slotCtxRes.error,
        },
        { status: 500 }
      );
    }

    const slotContext = slotCtxRes.context;
    const membershipRows = slotContext.rows;
    const classIds = slotContext.visibleClassIds;
    const billableMembershipRows = membershipRows.filter((row) => row.isBillable);

    console.log(
      `[home] joined-classes source=class_memberships count=${classIds.length} ` +
        `classIds=${classIds.map(tailId).join(",") || "-"} device=${tailId(normalizedDeviceId)}`
    );

    for (const row of membershipRows) {
      if (row.isBillable) continue;
      console.log(
        `[home] class-hidden reason=legacy_entry_class class=${tailId(row.classId)} name=${row.className ?? "-"}`
      );
    }

    if (classIds.length === 0) {
      const visibility = buildHomeClassVisibilityDebug({
        rows: membershipRows,
        visibleClassIds: [],
      });

      return NextResponse.json({
        ok: true,
        classes: [],
        class_slots: slotContext.slotLimit,
        membership_count_billable: slotContext.slotCount,
        membership_count_total: slotContext.snapshot.totalCount,
        membership_count_legacy: slotContext.snapshot.legacyCount,
        debug: {
          membershipCount: membershipRows.length,
          visibleClassCount: 0,
          billableMembershipCount: slotContext.slotCount,
          legacyMembershipCount: slotContext.snapshot.legacyCount,
          classSlots: slotContext.slotLimit,
          visibility: {
            ...visibility,
            deviceId: normalizedDeviceId,
            plan: { slotLimit: slotContext.slotLimit },
            excludedReasons: slotContext.excludedReasons,
          },
          ...(debugMemberships
            ? {
                deviceId: normalizedDeviceId,
                plan: { slotLimit: slotContext.slotLimit },
                activeMembershipClassIds: slotContext.activeMembershipClassIds,
                visibleClassIds: slotContext.visibleClassIds,
                slotCountClassIds: slotContext.slotCountClassIds,
                leftClassIds: slotContext.leftClassIds,
                excludedReasons: slotContext.excludedReasons,
              }
            : {}),
        },
      });
    }

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
      (classRows ?? []).map((c: { id: string }) => [String(c.id).trim(), c])
    );

    for (const row of billableMembershipRows) {
      if (!classMap.has(row.classId)) {
        console.log(
          `[home] class-hidden reason=class_row_missing class=${tailId(row.classId)}`
        );
      }
    }

    const topicKeys = Array.from(
      new Set(
        (classRows ?? [])
          .map((c: { topic_key?: string | null }) => String(c.topic_key ?? "").trim())
          .filter(Boolean)
      )
    );

    let topicRows: Array<{ topic_key: string; title: string; description: string }> = [];
    if (topicKeys.length > 0) {
      const { data: topicsData, error: topicsErr } = await supabaseAdmin
        .from("topics")
        .select("topic_key,title,description")
        .in("topic_key", topicKeys);

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

      topicRows = (topicsData ?? []) as typeof topicRows;
    }

    const topicMap = new Map(
      topicRows.map((t) => [String(t.topic_key).trim(), t])
    );

    const recruitmentSessionTtlMinutes = await getRecruitmentSessionTtlMinutes();
    const recruitmentSessionTtlSetting = await getRecruitmentSessionTtlSetting();

    await expireStaleRecruitmentSessions(supabaseAdmin, {
      classIds,
      ttlMinutes: recruitmentSessionTtlMinutes,
      keepSessionsWithMembers: true,
    });

    const sessionMap = new Map<
      string,
      {
        id: string;
        status: string;
        created_at: string | null;
        status_label: string;
        is_recruiting: boolean;
      }
    >();

    let sessionRowCount = 0;

    for (const classId of classIds) {
      const classRow = classMap.get(classId) as
        | { match_deadline_at?: string | null }
        | undefined;

      const classSessions = await listClassSessionsWithMembers(
        supabaseAdmin,
        classId,
        normalizedDeviceId
      );
      sessionRowCount += classSessions.length;

      const canonical = pickCanonicalOpenJoinedSession({
        sessions: classSessions,
        deviceId: normalizedDeviceId,
        matchDeadlineAt: classRow?.match_deadline_at ?? null,
        recruitmentSessionTtlMinutes,
        preferredSessionId: null,
      });

      if (!canonical) {
        logClassSessionsDebug(classId, classSessions);
        console.log(
          `[home] class-visible-without-active-session class=${tailId(classId)}`
        );
        continue;
      }

      logClassSessionsDebug(classId, classSessions, {
        selectedSessionId: canonical.sessionId,
        reason: formatClassSessionSelectionReason(
          canonical.reason,
          canonical.memberCount
        ),
      });

      const selectionReason = formatClassSessionSelectionReason(
        canonical.reason,
        canonical.memberCount
      );
      console.log(
        `[class-session] selected session=${tailId(canonical.sessionId)} ` +
          `reason=${selectionReason} members=${canonical.memberCount} ` +
          `class=${tailId(classId)} source=class_mine`
      );

      const statusLabel = resolveMembershipStatusLabel({
        hasActiveSession: true,
        sessionStatus: canonical.sessionStatus,
        matchDeadlineAt: classRow?.match_deadline_at ?? null,
        sessionCreatedAt: canonical.sessionCreatedAt,
        recruitmentSessionTtlMinutes,
      });

      sessionMap.set(classId, {
        id: canonical.sessionId,
        status: canonical.sessionStatus,
        created_at: canonical.sessionCreatedAt,
        status_label: statusLabel,
        is_recruiting: statusLabel === "募集中",
      });
    }

    const meetingPlanMap =
      (await fetchActiveMeetingPlansForClasses(classIds)) ?? new Map();
    const callRequestMap =
      (await fetchActiveCallRequestsForClasses(classIds, normalizedDeviceId)) ??
      new Map();
    const unreadCountMap =
      (await fetchUnreadCountsForClasses(normalizedDeviceId, classIds)) ??
      new Map();

    const classes = classIds.map((classId) => {
      const c = classMap.get(classId) as
        | {
            id?: string;
            name?: string;
            description?: string;
            world_key?: string | null;
            topic_key?: string | null;
            min_age?: number;
            is_sensitive?: boolean;
            is_user_created?: boolean;
            created_at?: string | null;
            match_deadline_at?: string | null;
          }
        | undefined;
      const topicKey = String(c?.topic_key ?? "").trim();
      const topic = topicKey ? topicMap.get(topicKey) : null;
      const session = sessionMap.get(classId);
      const meetingPlan = meetingPlanMap.get(classId) ?? null;
      const callRequest = callRequestMap.get(classId) ?? null;
      const unreadCount = unreadCountMap.get(classId) ?? 0;
      const statusLabel = resolveMembershipStatusLabel({
        hasActiveSession: Boolean(session?.id),
        sessionStatus: session?.status ?? null,
        matchDeadlineAt: c?.match_deadline_at ?? null,
        sessionCreatedAt: session?.created_at ?? null,
        recruitmentSessionTtlMinutes,
      });

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
        status_label: statusLabel,
        is_recruiting: Boolean(session?.is_recruiting),
        next_meeting_plan: meetingPlan,
        active_call_request: callRequest,
        unread_count: unreadCount,
      };
    });

    const visibleClassIds = classes.map((c) => String(c.id));
    const resolvedVisible = resolveHomeVisibleBillableClassIds(membershipRows);
    if (visibleClassIds.length !== resolvedVisible.visibleClassIds.length) {
      console.warn("[class/mine] visible-class mismatch", {
        rendered: visibleClassIds.map(tailId),
        expected: resolvedVisible.visibleClassIds.map(tailId),
      });
    }

    const visibility = buildHomeClassVisibilityDebug({
      rows: membershipRows,
      visibleClassIds,
    });

    console.log("[class/mine] slot snapshot", {
      classSlots: slotContext.slotLimit,
      slotCount: slotContext.slotCount,
      visibleClassCount: classes.length,
      hidden: visibility.hidden.map((row) => ({
        classId: tailId(row.classId),
        reason: row.reason,
      })),
    });

    return NextResponse.json({
      ok: true,
      classes,
      class_slots: slotContext.slotLimit,
      membership_count_billable: slotContext.slotCount,
      membership_count_total: slotContext.snapshot.totalCount,
      membership_count_legacy: slotContext.snapshot.legacyCount,
      recruitment_session_ttl_minutes: recruitmentSessionTtlMinutes,
      recruitment_session_ttl_unlimited: recruitmentSessionTtlSetting.unlimited,
      debug: {
        membershipCount: membershipRows.length,
        visibleClassCount: classes.length,
        billableMembershipCount: slotContext.slotCount,
        legacyMembershipCount: slotContext.snapshot.legacyCount,
        classSlots: slotContext.slotLimit,
        classRowCount: classRows?.length ?? 0,
        topicRowCount: topicRows.length,
        sessionRowCount,
        joinFailedCount: classes.filter((c) => !c.join_ok).length,
        billableClassIds: slotContext.slotCountClassIds,
        legacyClassIds: slotContext.snapshot.legacyClassIds,
        visibility: {
          ...visibility,
          deviceId: normalizedDeviceId,
          plan: { slotLimit: slotContext.slotLimit },
          excludedReasons: slotContext.excludedReasons,
        },
        ...(debugMemberships
          ? {
              deviceId: normalizedDeviceId,
              plan: { slotLimit: slotContext.slotLimit },
              activeMembershipClassIds: slotContext.activeMembershipClassIds,
              visibleClassIds: slotContext.visibleClassIds,
              slotCountClassIds: slotContext.slotCountClassIds,
              leftClassIds: slotContext.leftClassIds,
              excludedReasons: slotContext.excludedReasons,
              memberships: membershipRows,
              visibleClasses: classes.map((c) => ({
                id: c.id,
                name: c.name,
                has_active_session: c.has_active_session,
                status_label: c.status_label,
              })),
            }
          : {}),
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    console.error("[class/mine] internal error =", e);

    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        detail: message,
      },
      { status: 500 }
    );
  }
}
