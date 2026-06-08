import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  evaluateHintSessionForOpenJoined,
  evaluateOpenJoinedSessionReuse,
  isRecruitingSessionStatus,
  isSessionJoinableForOpenClass,
  normalizeSessionStatus,
  shouldCreateNewOpenClassSession,
  type OpenJoinedSessionInvalidReason,
} from "@/lib/recruitment";
import { recruitmentSessionCutoffIso } from "@/lib/expireRecruitmentSessions";
import { tailMatchId } from "@/lib/matchJoinLogging";
import {
  listClassSessionsWithMembers,
  logClassSessionsDebug,
  pickCanonicalOpenJoinedSession,
  type CanonicalSessionPick,
  type ClassSessionRow,
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

function logRejectHintSession(params: {
  sessionId: string;
  classId: string;
  reason: string;
  status: string;
  memberCount: number;
  matchDeadlineAt: string | null;
  sessionCreatedAt: string | null;
  recruitmentSessionTtlMinutes: number | null;
  staleReason?: string | null;
}) {
  const cutoff =
    params.recruitmentSessionTtlMinutes != null
      ? recruitmentSessionCutoffIso(params.recruitmentSessionTtlMinutes)
      : null;
  console.log(
    `[class-session] reject-hint-session session=${tailMatchId(params.sessionId)} ` +
      `reason=${params.reason} status=${params.status} memberCount=${params.memberCount} ` +
      `match_deadline_at=${params.matchDeadlineAt ?? "-"} cutoff=${cutoff ?? "-"} ` +
      `created_at=${params.sessionCreatedAt ?? "-"} staleReason=${params.staleReason ?? "-"} ` +
      `class=${tailMatchId(params.classId)}`
  );
}

async function loadHintSessionRow(
  hintSessionId: string,
  classSessions: ClassSessionRow[],
  deviceId: string
): Promise<ClassSessionRow | null> {
  const existing = classSessions.find((row) => row.id === hintSessionId);
  if (existing) return existing;

  const { data: sessionRow, error } = await supabase
    .from("sessions")
    .select("id,status,created_at,capacity,class_id")
    .eq("id", hintSessionId)
    .maybeSingle();

  if (error || !sessionRow?.id) return null;

  const { data: memberRows } = await supabase
    .from("session_members")
    .select("device_id")
    .eq("session_id", hintSessionId);

  const memberIds = (memberRows ?? [])
    .map((row) => String(row.device_id ?? "").trim())
    .filter(Boolean);

  return {
    id: String(sessionRow.id),
    status: String(sessionRow.status ?? "forming"),
    createdAt: sessionRow.created_at ?? null,
    capacity: Number(sessionRow.capacity ?? 5),
    memberCount: memberIds.length,
    memberIds,
    deviceIsMember: memberIds.includes(deviceId),
  };
}

async function resolveHintSessionPick(params: {
  hintSessionId: string;
  classId: string;
  classSessions: ClassSessionRow[];
  deviceId: string;
  matchDeadlineAt: string | null;
  recruitmentSessionTtlMinutes: number | null;
}): Promise<CanonicalSessionPick | null> {
  const hintRow = await loadHintSessionRow(
    params.hintSessionId,
    params.classSessions,
    params.deviceId
  );

  if (!hintRow) {
    logRejectHintSession({
      sessionId: params.hintSessionId,
      classId: params.classId,
      reason: "not_found",
      status: "-",
      memberCount: 0,
      matchDeadlineAt: params.matchDeadlineAt,
      sessionCreatedAt: null,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
    });
    return null;
  }

  const hintEval = evaluateHintSessionForOpenJoined({
    sessionStatus: hintRow.status,
    sessionCreatedAt: hintRow.createdAt,
    matchDeadlineAt: params.matchDeadlineAt,
    memberCount: hintRow.memberCount,
    recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
  });

  if (!hintEval.reusable) {
    if (hintEval.reason) {
      logRejectHintSession({
        sessionId: hintRow.id,
        classId: params.classId,
        reason: hintEval.reason,
        status: normalizeSessionStatus(hintRow.status),
        memberCount: hintRow.memberCount,
        matchDeadlineAt: params.matchDeadlineAt,
        sessionCreatedAt: hintRow.createdAt,
        recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
        staleReason: hintEval.staleReason,
      });
    }
    return null;
  }

  const status = normalizeSessionStatus(hintRow.status);
  const reason: CanonicalSessionPick["reason"] =
    isRecruitingSessionStatus(status) && hintRow.memberCount === 0
      ? "hint_joinable_empty"
      : "reuse_requested_session";

  if (reason === "hint_joinable_empty") {
    console.log(
      `[class-session] reuse-hint-empty-forming session=${tailMatchId(hintRow.id)} ` +
        `reason=hint_joinable_empty members=${hintRow.memberCount} ` +
        `class=${tailMatchId(params.classId)}`
    );
  }

  return {
    sessionId: hintRow.id,
    sessionStatus: hintRow.status,
    sessionCreatedAt: hintRow.createdAt,
    memberCount: hintRow.memberCount,
    reason,
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

function buildStaleReuseReason(params: {
  allowHintReuse?: boolean;
  recruitingStatus: boolean;
  memberCount: number;
  selectionReason: string;
}) {
  if (
    params.allowHintReuse &&
    params.recruitingStatus &&
    params.memberCount === 0
  ) {
    return "hint_joinable_empty_ignore_stale";
  }
  return `${params.selectionReason}_ignore_recruitment_ttl_stale`;
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
  allowHintReuse?: boolean;
}): Promise<ResolveOk | ResolveErr> {
  const sessionId = params.sessionId;
  const sessionStatus = params.sessionStatus;
  const sessionCreatedAt = params.sessionCreatedAt;
  const memberCount = params.memberCount;
  const selectionReason = params.selectionReason;
  const recruitingStatus = isRecruitingSessionStatus(sessionStatus);

  const localCheck = isSessionJoinableForOpenClass({
    sessionStatus,
    sessionCreatedAt,
    matchDeadlineAt: params.matchDeadlineAt,
    memberCount,
    recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
  });

  if (localCheck.joinable) {
    return {
      ok: true,
      sessionId,
      sessionStatus,
      sessionCreatedAt,
      createdNewSession: false,
      reused: true,
      selectionReason,
    };
  }

  const reuseDespiteStale =
    localCheck.reason === "stale" &&
    (memberCount > 0 || (params.allowHintReuse && recruitingStatus));

  if (reuseDespiteStale) {
    const staleReuseReason = buildStaleReuseReason({
      allowHintReuse: params.allowHintReuse,
      recruitingStatus,
      memberCount,
      selectionReason,
    });
    console.log(
      `[class-session] reuse session=${tailMatchId(sessionId)} ` +
        `reason=${staleReuseReason} members=${memberCount} ` +
        `class=${tailMatchId(params.classId)}`
    );
    return {
      ok: true,
      sessionId,
      sessionStatus,
      sessionCreatedAt,
      createdNewSession: false,
      reused: true,
      selectionReason: staleReuseReason,
    };
  }

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
    (memberCount > 0 || (params.allowHintReuse && recruitingStatus))
  ) {
    const staleReuseReason = buildStaleReuseReason({
      allowHintReuse: params.allowHintReuse,
      recruitingStatus,
      memberCount,
      selectionReason,
    });
    console.log(
      `[class-session] reuse session=${tailMatchId(sessionId)} ` +
        `reason=${staleReuseReason} members=${memberCount} ` +
        `class=${tailMatchId(params.classId)} source=live_db`
    );
    return {
      ok: true,
      sessionId,
      sessionStatus,
      sessionCreatedAt,
      createdNewSession: false,
      reused: true,
      selectionReason: staleReuseReason,
    };
  }

  if (params.allowHintReuse && recruitingStatus) {
    console.log(
      `[class-session] reuse session=${tailMatchId(sessionId)} ` +
        `reason=hint_joinable_empty members=${memberCount} ` +
        `class=${tailMatchId(params.classId)} source=hint_force`
    );
    return {
      ok: true,
      sessionId,
      sessionStatus,
      sessionCreatedAt,
      createdNewSession: false,
      reused: true,
      selectionReason: "hint_joinable_empty",
    };
  }

  const createReason: OpenJoinedSessionInvalidReason | null =
    localCheck.reason ?? live.joinable.reason ?? null;

  console.log(
    `[match-join] existing-session invalid reason=${createReason ?? "unknown"} ` +
      `session=${tailMatchId(sessionId)} class=${tailMatchId(params.classId)} ` +
      `status=${normalizeSessionStatus(sessionStatus)} members=${memberCount} ` +
      `staleReason=${live.joinable.reason ?? "-"}`
  );

  if (!shouldCreateNewOpenClassSession(createReason, memberCount, sessionStatus)) {
    console.log(
      `[class-session] blocked-new-session reason=${createReason} ` +
        `members=${memberCount} status=${normalizeSessionStatus(sessionStatus)} ` +
        `class=${tailMatchId(params.classId)}`
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

  if (hintSessionId) {
    const hintPick = await resolveHintSessionPick({
      hintSessionId,
      classId: params.classId,
      classSessions,
      deviceId,
      matchDeadlineAt: params.matchDeadlineAt,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
    });

    if (hintPick) {
      logClassSessionsDebug(params.classId, classSessions, {
        selectedSessionId: hintPick.sessionId,
        reason: hintPick.reason,
      });
      const hintSelectionReason =
        hintPick.reason === "hint_joinable_empty"
          ? "hint_joinable_empty"
          : formatClassSessionSelectionReason(
              hintPick.reason,
              hintPick.memberCount
            );
      console.log(
        `[class-session] selected session=${tailMatchId(hintPick.sessionId)} ` +
          `reason=${hintSelectionReason} members=${hintPick.memberCount} ` +
          `class=${tailMatchId(params.classId)} source=hint`
      );

      return ensureJoinableSessionOrCreate({
        classId: params.classId,
        className: params.className,
        sessionId: hintPick.sessionId,
        sessionStatus: hintPick.sessionStatus,
        sessionCreatedAt: hintPick.sessionCreatedAt,
        matchDeadlineAt: params.matchDeadlineAt,
        memberCount: hintPick.memberCount,
        requestedCapacity: params.requestedCapacity,
        recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
        selectionReason: hintSelectionReason,
        allowHintReuse: true,
      });
    }
  }

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
      allowHintReuse: canonical.sessionId === hintSessionId,
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
