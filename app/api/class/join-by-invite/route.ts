import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBillableMembershipSnapshot } from "@/lib/classMembershipSlots";
import { ensureClassSessionMembership } from "@/lib/ensureClassSessionMembership";
import { tailJoinId } from "@/lib/joinStateInvariants";
import { resolveInviteJoinSession } from "@/lib/inviteJoinSession";
import { isDeadlinePassed } from "@/lib/recruitment";
import { getRecruitmentSessionTtlMinutes } from "@/lib/recruitmentSettings";
import { enforceDeviceJoinAge, joinAgeGuardResponse } from "@/lib/joinAgeGuard";
import {
  resolveApiActor,
  getClassSlotsForActor,
} from "@/lib/actorIdentity";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ensureMembershipSlots(params: {
  actor: { userId: string | null; deviceId: string };
  classId: string;
  classSlots: number;
}) {
  const { actor, classId, classSlots } = params;

  const billableRes = await getBillableMembershipSnapshot(
    supabase,
    actor.deviceId,
    actor.userId
  );
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
    const requestedSessionId = String(body?.sessionId ?? "").trim();
    const deviceId = String(body?.deviceId ?? "").trim();

    console.log(
      `[invite-join] start class=${tailJoinId(classId)} session=${tailJoinId(requestedSessionId)} device=${tailJoinId(deviceId)}`
    );

    if (!classId || !requestedSessionId || !deviceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_params",
          required: ["classId", "sessionId", "deviceId"],
        },
        { status: 400 }
      );
    }

    const actorResult = await resolveApiActor({ req, deviceId });
    const userId = actorResult.ok ? actorResult.actor.userId : "";
    const actor = { userId: userId || null, deviceId };

    const ageGuard = await enforceDeviceJoinAge(deviceId, userId || null);
    if (!ageGuard.ok) return joinAgeGuardResponse(ageGuard);

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

    const slotsRes = await getClassSlotsForActor(supabase, actor);
    if (!slotsRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "entitlements_lookup_failed",
          detail: slotsRes.error,
        },
        { status: 500 }
      );
    }

    const membershipRes = await ensureMembershipSlots({
      actor,
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
    const resolved = await resolveInviteJoinSession({
      client: supabase,
      classId,
      requestedSessionId,
      deviceId,
      matchDeadlineAt: klass.match_deadline_at ?? null,
      recruitmentSessionTtlMinutes,
    });

    if (!resolved.ok) {
      const status =
        resolved.error === "recruitment_closed" ? 403 : 400;
      console.warn(
        `[invite-join] failed step=resolve-session error=${resolved.error} ` +
          `class=${tailJoinId(classId)} requested=${tailJoinId(requestedSessionId)} ` +
          `status=${resolved.sessionStatus ?? "-"} members=${resolved.memberCount ?? 0} ` +
          `reason=${resolved.reason ?? "-"}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: resolved.error,
          requestedSessionId,
          sessionStatus: resolved.sessionStatus ?? null,
          memberCount: resolved.memberCount ?? 0,
          reason: resolved.reason ?? null,
        },
        { status }
      );
    }

    const sessionId = resolved.sessionId;

    const joinState = await ensureClassSessionMembership({
      classId,
      sessionId,
      deviceId,
      userId: userId || null,
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
      `[invite-join] success class=${tailJoinId(classId)} session=${tailJoinId(sessionId)} ` +
        `requested=${tailJoinId(requestedSessionId)} device=${tailJoinId(deviceId)} ` +
        `userId=${userId || "-"} ` +
        `fallback=${resolved.sessionFallback ? 1 : 0} reactivated=${resolved.sessionReactivated ? 1 : 0} ` +
        `reason=${resolved.reason} members=${resolved.memberCount} ` +
        `selfHealed=${joinState.selfHealed.join(",") || "none"}`
    );

    let displayName = "参加者";
    if (userId) {
      const { data: profileByUser } = await supabase
        .from("user_profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();
      displayName = String(profileByUser?.display_name ?? "").trim() || displayName;
    }

    if (displayName === "参加者") {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name")
        .eq("device_id", deviceId)
        .maybeSingle();
      displayName = String(profile?.display_name ?? "").trim() || displayName;
    }

    return NextResponse.json({
      ok: true,
      classId,
      sessionId,
      requestedSessionId,
      sessionFallback: resolved.sessionFallback,
      sessionReactivated: resolved.sessionReactivated,
      sessionFallbackReason: resolved.reason,
      className: String(klass.name ?? "").trim() || "クラス",
      alreadyJoined: membershipRes.alreadyJoined,
      currentCount: membershipRes.currentCount,
      classSlots: slotsRes.classSlots,
      userId: userId || null,
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
