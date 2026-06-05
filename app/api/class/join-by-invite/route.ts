import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBillableMembershipSnapshot } from "@/lib/classMembershipSlots";
import { ensureClassSessionMembership } from "@/lib/ensureClassSessionMembership";
import { tailJoinId } from "@/lib/joinStateInvariants";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  evaluateOpenJoinedSessionReuse,
  isDeadlinePassed,
  isSessionEligibleForNormalJoin,
} from "@/lib/recruitment";
import { getRecruitmentSessionTtlMinutes } from "@/lib/recruitmentSettings";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getClassSlots(deviceId: string) {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("class_slots")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "entitlements_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    classSlots: Math.max(1, Number(data?.class_slots ?? 1)),
  };
}

async function ensureMembershipSlots(params: {
  deviceId: string;
  classId: string;
  classSlots: number;
}) {
  const { deviceId, classId, classSlots } = params;

  const billableRes = await getBillableMembershipSnapshot(supabase, deviceId);
  if (!billableRes.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "memberships_lookup_failed",
          detail: billableRes.error,
        },
        { status: 500 }
      ),
    };
  }

  const ids = billableRes.snapshot.billableClassIds;

  if (ids.includes(classId)) {
    return {
      ok: true as const,
      alreadyJoined: true,
      currentCount: ids.length,
    };
  }

  if (ids.length >= classSlots) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: ids.length,
          totalMembershipCount: billableRes.snapshot.totalCount,
          legacyMembershipCount: billableRes.snapshot.legacyCount,
          classSlots,
        },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true as const,
    alreadyJoined: false,
    currentCount: ids.length,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const classId = String(body?.classId ?? "").trim();
    const sessionId = String(body?.sessionId ?? "").trim();
    const deviceId = String(body?.deviceId ?? "").trim();

    console.log(
      `[invite-join] start class=${tailJoinId(classId)} session=${tailJoinId(sessionId)} device=${tailJoinId(deviceId)}`
    );

    if (!classId || !sessionId || !deviceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_params",
          required: ["classId", "sessionId", "deviceId"],
        },
        { status: 400 }
      );
    }

    const { data: klass, error: classError } = await supabase
      .from("classes")
      .select("id,name,match_deadline_at")
      .eq("id", classId)
      .maybeSingle();

    if (classError) {
      return NextResponse.json(
        { ok: false, error: "class_lookup_failed", detail: classError.message },
        { status: 500 }
      );
    }

    if (!klass) {
      return NextResponse.json(
        { ok: false, error: "class_not_found", classId },
        { status: 404 }
      );
    }

    const slotsRes = await getClassSlots(deviceId);
    if (!slotsRes.ok) return slotsRes.response;

    const membershipRes = await ensureMembershipSlots({
      deviceId,
      classId,
      classSlots: slotsRes.classSlots,
    });

    if (!membershipRes.ok) {
      console.warn(`[invite-join] failed step=slots error=class_slots_limit`);
      return membershipRes.response;
    }

    if (isDeadlinePassed(klass.match_deadline_at ?? null)) {
      return NextResponse.json(
        { ok: false, error: "match_deadline_passed" },
        { status: 403 }
      );
    }

    const recruitmentSessionTtlMinutes = await getRecruitmentSessionTtlMinutes();
    await expireStaleRecruitmentSessions(supabase, {
      classIds: [classId],
      ttlMinutes: recruitmentSessionTtlMinutes,
    });

    const { data: sessionRow, error: sessionErr } = await supabase
      .from("sessions")
      .select("id,status,class_id,created_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json(
        { ok: false, error: "session_lookup_failed", detail: sessionErr.message },
        { status: 500 }
      );
    }

    if (!sessionRow) {
      return NextResponse.json(
        { ok: false, error: "session_not_found", sessionId },
        { status: 404 }
      );
    }

    const sessionStatus = String(sessionRow.status ?? "").trim().toLowerCase();
    if (
      sessionStatus === "closed" ||
      sessionStatus === "ended" ||
      sessionStatus === "expired"
    ) {
      console.log(
        `[room join] reject-closed-session session=${sessionId.slice(-6)} reason=${sessionStatus}`
      );
      return NextResponse.json(
        { ok: false, error: "session_closed", sessionStatus },
        { status: 400 }
      );
    }

    if (String(sessionRow.class_id ?? "").trim() !== classId) {
      return NextResponse.json(
        { ok: false, error: "session_class_mismatch", sessionId, classId },
        { status: 409 }
      );
    }

    const { data: memberRows } = await supabase
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionId);
    const memberIds = (memberRows ?? [])
      .map((row) => String(row.device_id ?? "").trim())
      .filter(Boolean);
    const reuse = evaluateOpenJoinedSessionReuse({
      sessionStatus: sessionStatus,
      sessionCreatedAt: sessionRow.created_at ?? null,
      matchDeadlineAt: klass.match_deadline_at ?? null,
      memberCount: memberIds.length,
      deviceIsSessionMember: memberIds.includes(deviceId),
      recruitmentSessionTtlMinutes,
    });
    if (!reuse.reusable) {
      console.log(
        `[match-join] existing-session invalid reason=${reuse.reason ?? "unknown"} session=${sessionId.slice(-6)}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: "session_not_joinable",
          reason: reuse.reason ?? "unknown",
        },
        { status: 403 }
      );
    }
    if (
      !isSessionEligibleForNormalJoin({
        sessionStatus,
        sessionCreatedAt: sessionRow.created_at ?? null,
        recruitmentSessionTtlMinutes,
      }) &&
      sessionStatus !== "active"
    ) {
      return NextResponse.json(
        { ok: false, error: "recruitment_closed", sessionStatus },
        { status: 403 }
      );
    }

    const joinState = await ensureClassSessionMembership({
      classId,
      sessionId,
      deviceId,
      source: "invite",
      client: supabase,
    });

    if (!joinState.ok) {
      const status =
        joinState.error === "session_class_mismatch" ? 409 : 400;
      console.warn(
        `[invite-join] failed step=join-state error=${joinState.error} class=${tailJoinId(classId)} session=${tailJoinId(sessionId)}`
      );
      return NextResponse.json(joinState, { status });
    }

    console.log(
      `[invite-join] success class=${tailJoinId(classId)} session=${tailJoinId(sessionId)} device=${tailJoinId(deviceId)} ` +
        `selfHealed=${joinState.selfHealed.join(",") || "none"}`
    );

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("device_id", deviceId)
      .maybeSingle();

    const displayName =
      String(profile?.display_name ?? "").trim() || "参加者";

    return NextResponse.json({
      ok: true,
      classId,
      sessionId,
      className: String(klass.name ?? "").trim() || "クラス",
      alreadyJoined: membershipRes.alreadyJoined,
      currentCount: membershipRes.currentCount,
      classSlots: slotsRes.classSlots,
      displayName,
      photoPath: null,
      joinState,
    });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[invite-join] failed step=server error=${detail}`);

    return NextResponse.json(
      { ok: false, error: "server_error", detail },
      { status: 500 }
    );
  }
}
