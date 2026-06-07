import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  evaluateOpenJoinedSessionReuse,
  isSessionJoinableForOpenClass,
  shouldCreateNewOpenClassSession,
  type OpenJoinedSessionInvalidReason,
} from "@/lib/recruitment";
import { tailMatchId } from "@/lib/matchJoinLogging";
import {
  listClassSessionsWithMembers,
  logClassSessionsDebug,
  pickCanonicalOpenJoinedSession,
} from "@/lib/classSessionSelection";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ResolveParams = {
  classId: string;
  className: string;
  sessionId: string;
  sessionStatus: string;
  sessionCreatedAt: string | null;
  matchDeadlineAt: string | null;
  deviceId: string;
  requestedCapacity: number;
  recruitmentSessionTtlMinutes: number | null;
  hintSessionId?: string | null;
};

type ResolveOk = {
  ok: true;
  sessionId: string;
  sessionStatus: string;
  sessionCreatedAt: string | null;
  createdNewSession: boolean;
  reused: boolean;
  selectionReason: string;
};

type ResolveErr = {
  ok: false;
  response: NextResponse;
};

export function formatClassSessionSelectionReason(
  reason: string,
  memberCount: number
): string {
  if (memberCount > 0 && reason.startsWith("reuse")) {
    return "reuse_existing_members_session";
  }
  return reason;
}

export async function createFormingSession(params: {
  classId: string;
  className: string;
  requestedCapacity: number;
  reason: OpenJoinedSessionInvalidReason | "no_valid_active_session" | "no_joinable_session";
}) {
  const logReason =
    params.reason === "no_valid_active_session"
      ? "no_joinable_session"
      : params.reason;
  console.log(
    `[class-session] create-new reason=${logReason} class=${tailMatchId(params.classId)}`
  );

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      class_id: params.classId,
      topic: params.className,
      status: "forming",
      capacity: params.requestedCapacity,
    })
    .select("id,status,created_at")
    .single();

  if (error || !data?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "forced_session_create_failed",
          detail: error?.message ?? "create_failed",
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    sessionId: String(data.id),
    sessionStatus: String(data.status ?? "forming"),
    sessionCreatedAt: data.created_at ?? null,
  };
}

async function loadSessionJoinability(
  sessionId: string,
  matchDeadlineAt: string | null,
  recruitmentSessionTtlMinutes: number | null
) {
  const id = String(sessionId ?? "").trim();
  if (!id) {
    return {
      ok: false as const,
      joinable: { joinable: false, reason: "unknown" as const },
    };
  }

  const { data: sessionRow, error } = await supabase
    .from("sessions")
    .select("id,status,created_at,capacity")
    .eq("id", id)
    .maybeSingle();

  if (error || !sessionRow?.id) {
    return {
      ok: false as const,
      joinable: { joinable: false, reason: "unknown" as const },
    };
  }

  const { count } = await supabase
    .from("session_members")
    .select("device_id", { count: "exact", head: true })
    .eq("session_id", id);

  const memberCount = Number(count ?? 0);
  const capacity = Number(sessionRow.capacity ?? 5);
  if (memberCount >= capacity) {
    return {
      ok: false as const,
      joinable: { joinable: false, reason: "unknown" as const },
    };
  }

  const joinable = isSessionJoinableForOpenClass({
    sessionStatus: String(sessionRow.status ?? ""),
    sessionCreatedAt: sessionRow.created_at ?? null,
    matchDeadlineAt,
    memberCount,
    recruitmentSessionTtlMinutes,
  });

  if (!joinable.joinable) {
    return { ok: false as const, joinable };
  }

  return {
    ok: true as const,
    sessionId: id,
    sessionStatus: String(sessionRow.status ?? "forming"),
    sessionCreatedAt: sessionRow.created_at ?? null,
    memberCount,
    joinable,
  };
}

async function ensureJoinableSessionOrCreate(params: {
  classId: string;
  className: string;
  sessionId: string;
  sessionStatus: string;
  sessionCreatedAt: string | null;
  matchDeadlineAt: string | null;
  memberCount: number;
  requestedCapacity: number;
  recruitmentSessionTtlMinutes: number | null;
  selectionReason: string;
}): Promise<ResolveOk | ResolveErr> {
  const localCheck = isSessionJoinableForOpenClass({
    sessionStatus: params.sessionStatus,
    sessionCreatedAt: params.sessionCreatedAt,
    matchDeadlineAt: params.matchDeadlineAt,
    memberCount: params.memberCount,
    recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
  });

  let sessionId = params.sessionId;
  let sessionStatus = params.sessionStatus;
  let sessionCreatedAt = params.sessionCreatedAt;
  let memberCount = params.memberCount;
  let selectionReason = params.selectionReason;

  const reuseDespiteStale =
    !localCheck.joinable &&
    localCheck.reason === "stale" &&
    memberCount > 0;

  if (!localCheck.joinable && !reuseDespiteStale) {
    console.log(
      `[match-join] existing-session invalid reason=${localCheck.reason ?? "unknown"} ` +
        `session=${tailMatchId(sessionId)} class=${tailMatchId(params.classId)}`
    );
  } else if (reuseDespiteStale) {
    console.log(
      `[class-session] reuse session=${tailMatchId(sessionId)} ` +
        `reason=reuse_members_ignore_recruitment_ttl_stale members=${memberCount} ` +
        `class=${tailMatchId(params.classId)}`
    );
    return {
      ok: true,
      sessionId,
      sessionStatus,
      sessionCreatedAt,
      createdNewSession: false,
      reused: true,
      selectionReason: `${selectionReason}_ignore_recruitment_ttl_stale`,
    };
  } else {
    const live = await loadSessionJoinability(
      sessionId,
      params.matchDeadlineAt,
      params.recruitmentSessionTtlMinutes
    );

    if (live.ok) {
      return {
        ok: true,
        sessionId: live.sessionId,
        sessionStatus: live.sessionStatus,
        sessionCreatedAt: live.sessionCreatedAt,
        createdNewSession: false,
        reused: true,
        selectionReason,
      };
    }

    if (
      live.joinable.reason === "stale" &&
      memberCount > 0
    ) {
      console.log(
        `[class-session] reuse session=${tailMatchId(sessionId)} ` +
          `reason=reuse_members_ignore_recruitment_ttl_stale members=${memberCount} ` +
          `class=${tailMatchId(params.classId)} source=live_db`
      );
      return {
        ok: true,
        sessionId,
        sessionStatus,
        sessionCreatedAt,
        createdNewSession: false,
        reused: true,
        selectionReason: `${selectionReason}_ignore_recruitment_ttl_stale`,
      };
    }

    console.log(
      `[match-join] existing-session invalid reason=${live.joinable.reason ?? "unknown"} ` +
        `session=${tailMatchId(sessionId)} class=${tailMatchId(params.classId)} ` +
        `source=live_db`
    );
  }

  const createReason: OpenJoinedSessionInvalidReason | null =
    localCheck.reason ?? null;
  if (!shouldCreateNewOpenClassSession(createReason, memberCount)) {
    console.log(
      `[class-session] blocked-new-session reason=${createReason} ` +
        `members=${memberCount} class=${tailMatchId(params.classId)}`
    );
    return {
      ok: true,
      sessionId,
      sessionStatus,
      sessionCreatedAt,
      createdNewSession: false,
      reused: true,
      selectionReason: `${selectionReason}_blocked_new_session_${createReason}`,
    };
  }

  const created = await createFormingSession({
    classId: params.classId,
    className: params.className,
    requestedCapacity: params.requestedCapacity,
    reason: createReason ?? "no_joinable_session",
  });

  if (!created.ok) return created;

  return {
    ok: true,
    sessionId: created.sessionId,
    sessionStatus: created.sessionStatus,
    sessionCreatedAt: created.sessionCreatedAt,
    createdNewSession: true,
    reused: false,
    selectionReason: "create_new_session_not_joinable",
  };
}

export async function resolveOpenJoinedClassSession(
  params: ResolveParams
): Promise<ResolveOk | ResolveErr> {
  const deviceId = String(params.deviceId ?? "").trim();

  await expireStaleRecruitmentSessions(supabase, {
    classIds: [params.classId],
    ttlMinutes: params.recruitmentSessionTtlMinutes,
    keepSessionsWithMembers: true,
  });

  const classSessions = await listClassSessionsWithMembers(
    supabase,
    params.classId,
    deviceId
  );

  const hintSessionId = String(
    params.hintSessionId ?? params.sessionId ?? ""
  ).trim();

  const canonical = pickCanonicalOpenJoinedSession({
    sessions: classSessions,
    deviceId,
    matchDeadlineAt: params.matchDeadlineAt,
    recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
    preferredSessionId: hintSessionId || null,
  });

  if (canonical) {
    logClassSessionsDebug(params.classId, classSessions, {
      selectedSessionId: canonical.sessionId,
      reason: canonical.reason,
    });
    const selectionReason = formatClassSessionSelectionReason(
      canonical.reason,
      canonical.memberCount
    );
    console.log(
      `[class-session] selected session=${tailMatchId(canonical.sessionId)} ` +
        `reason=${selectionReason} members=${canonical.memberCount} ` +
        `class=${tailMatchId(params.classId)}`
    );

    return ensureJoinableSessionOrCreate({
      classId: params.classId,
      className: params.className,
      sessionId: canonical.sessionId,
      sessionStatus: canonical.sessionStatus,
      sessionCreatedAt: canonical.sessionCreatedAt,
      matchDeadlineAt: params.matchDeadlineAt,
      memberCount: canonical.memberCount,
      requestedCapacity: params.requestedCapacity,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
      selectionReason: formatClassSessionSelectionReason(
        canonical.reason,
        canonical.memberCount
      ),
    });
  }

  logClassSessionsDebug(params.classId, classSessions);

  const rpcSession = classSessions.find((row) => row.id === params.sessionId);
  if (rpcSession) {
    const evaluation = evaluateOpenJoinedSessionReuse({
      sessionStatus: params.sessionStatus,
      sessionCreatedAt: params.sessionCreatedAt,
      matchDeadlineAt: params.matchDeadlineAt,
      memberCount: rpcSession.memberCount,
      deviceIsSessionMember: rpcSession.deviceIsMember,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
      allowJoinActiveWithoutMembership: true,
      ignoreRecruitmentTtlWhenHasMembers: true,
    });

    if (evaluation.reusable) {
      console.log(
        `[class-session] selected session=${tailMatchId(params.sessionId)} ` +
          `reason=reuse_rpc_session class=${tailMatchId(params.classId)}`
      );
      return ensureJoinableSessionOrCreate({
        classId: params.classId,
        className: params.className,
        sessionId: params.sessionId,
        sessionStatus: params.sessionStatus,
        sessionCreatedAt: params.sessionCreatedAt,
        matchDeadlineAt: params.matchDeadlineAt,
        memberCount: rpcSession.memberCount,
        requestedCapacity: params.requestedCapacity,
        recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
        selectionReason: "reuse_rpc_session",
      });
    }

    console.log(
      `[match-join] existing-session invalid reason=${evaluation.reason ?? "unknown"} ` +
        `session=${tailMatchId(params.sessionId)} class=${tailMatchId(params.classId)} ` +
        `status=${params.sessionStatus} members=${rpcSession.memberCount}`
    );
  }

  const created = await createFormingSession({
    classId: params.classId,
    className: params.className,
    requestedCapacity: params.requestedCapacity,
    reason: "no_joinable_session",
  });

  if (!created.ok) return created;

  return {
    ok: true,
    sessionId: created.sessionId,
    sessionStatus: created.sessionStatus,
    sessionCreatedAt: created.sessionCreatedAt,
    createdNewSession: true,
    reused: false,
    selectionReason: "create_new_no_valid_active_session",
  };
}
