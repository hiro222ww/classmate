import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  evaluateHintSessionForOpenJoined,
  evaluateOpenJoinedSessionReuse,
  isOpenJoinedHintReusableStatus,
  isRecruitmentSessionFresh,
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

function logHintCheck(params: {
  sessionId: string;
  classId: string;
  status: string;
  memberCount: number;
  stale: boolean;
  cutoff: string | null;
  sameClass: boolean;
  matchDeadlineAt: string | null;
}) {
  console.log(
    `[class-session] hint-check session=${tailMatchId(params.sessionId)} ` +
      `status=${params.status} memberCount=${params.memberCount} stale=${params.stale ? 1 : 0} ` +
      `cutoff=${params.cutoff ?? "-"} sameClass=${params.sameClass ? 1 : 0} ` +
      `match_deadline_at=${params.matchDeadlineAt ?? "-"} ` +
      `class=${tailMatchId(params.classId)}`
  );
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

type HintSessionLoadResult = {
  row: ClassSessionRow;
  sameClass: boolean;
  sessionClassId: string | null;
};

async function loadHintSessionRow(
  hintSessionId: string,
  expectedClassId: string,
  classSessions: ClassSessionRow[],
  deviceId: string
): Promise<HintSessionLoadResult | null> {
  const existing = classSessions.find((row) => row.id === hintSessionId);
  if (existing) {
    return {
      row: existing,
      sameClass: true,
      sessionClassId: expectedClassId,
    };
  }

  const { data: sessionRow, error } = await supabase
    .from("sessions")
    .select("id,status,created_at,capacity,class_id")
    .eq("id", hintSessionId)
    .maybeSingle();

  if (error || !sessionRow?.id) return null;

  const sessionClassId = String(sessionRow.class_id ?? "").trim() || null;
  const sameClass = sessionClassId === expectedClassId;

  const { data: memberRows } = await supabase
    .from("session_members")
    .select("device_id")
    .eq("session_id", hintSessionId);

  const memberIds = (memberRows ?? [])
    .map((row) => String(row.device_id ?? "").trim())
    .filter(Boolean);

  return {
    row: {
      id: String(sessionRow.id),
      status: String(sessionRow.status ?? "forming"),
      createdAt: sessionRow.created_at ?? null,
      capacity: Number(sessionRow.capacity ?? 5),
      memberCount: memberIds.length,
      memberIds,
      deviceIsMember: memberIds.includes(deviceId),
    },
    sameClass,
    sessionClassId,
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
  const loaded = await loadHintSessionRow(
    params.hintSessionId,
    params.classId,
    params.classSessions,
    params.deviceId
  );

  if (!loaded) {
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

  const hintRow = loaded.row;
  const status = normalizeSessionStatus(hintRow.status);
  const cutoff =
    params.recruitmentSessionTtlMinutes != null
      ? recruitmentSessionCutoffIso(params.recruitmentSessionTtlMinutes)
      : null;
  const stale =
    isOpenJoinedHintReusableStatus(status) &&
    !isRecruitmentSessionFresh(
      hintRow.createdAt,
      params.recruitmentSessionTtlMinutes
    );

  logHintCheck({
    sessionId: hintRow.id,
    classId: params.classId,
    status,
    memberCount: hintRow.memberCount,
    stale,
    cutoff,
    sameClass: loaded.sameClass,
    matchDeadlineAt: params.matchDeadlineAt,
  });

  if (!loaded.sameClass) {
    logRejectHintSession({
      sessionId: hintRow.id,
      classId: params.classId,
      reason: "wrong_class",
      status,
      memberCount: hintRow.memberCount,
      matchDeadlineAt: params.matchDeadlineAt,
      sessionCreatedAt: hintRow.createdAt,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
      staleReason: stale ? "stale" : null,
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
    logRejectHintSession({
      sessionId: hintRow.id,
      classId: params.classId,
      reason: hintEval.reason ?? "unknown",
      status,
      memberCount: hintRow.memberCount,
      matchDeadlineAt: params.matchDeadlineAt,
      sessionCreatedAt: hintRow.createdAt,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
      staleReason: hintEval.staleReason,
    });
    return null;
  }

  const reason: CanonicalSessionPick["reason"] =
    isOpenJoinedHintReusableStatus(status) && hintRow.memberCount === 0
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

async function reactivateExpiredHintSessionIfNeeded(params: {
  sessionId: string;
  sessionStatus: string;
  allowHintReuse?: boolean;
}): Promise<string> {
  const status = normalizeSessionStatus(params.sessionStatus);
  if (!params.allowHintReuse || status !== "expired") {
    return params.sessionStatus;
  }

  const { error } = await supabase
    .from("sessions")
    .update({ status: "forming" })
    .eq("id", params.sessionId)
    .eq("status", "expired");

  if (error) {
    console.warn(
      `[class-session] reactivate-expired-hint failed session=${tailMatchId(params.sessionId)} ` +
        `detail=${error.message}`
    );
    return params.sessionStatus;
  }

  console.log(
    `[class-session] reactivate-expired-hint session=${tailMatchId(params.sessionId)} ` +
      `status=forming`
  );
  return "forming";
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
  let sessionStatus = await reactivateExpiredHintSessionIfNeeded({
    sessionId: params.sessionId,
    sessionStatus: params.sessionStatus,
    allowHintReuse: params.allowHintReuse,
  });
  const sessionCreatedAt = params.sessionCreatedAt;
  const memberCount = params.memberCount;
  const selectionReason = params.selectionReason;
  const hintReusableStatus = isOpenJoinedHintReusableStatus(sessionStatus);
  const recruitingStatus = isRecruitingSessionStatus(sessionStatus);
  const hintTerminalReasons: OpenJoinedSessionInvalidReason[] = [
    "closed",
    "ended",
    "cutoff",
  ];

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

  if (
    params.allowHintReuse &&
    hintReusableStatus &&
    (!localCheck.reason || !hintTerminalReasons.includes(localCheck.reason))
  ) {
    const reuseReason =
      memberCount === 0 ? "hint_joinable_empty" : selectionReason;
    console.log(
      `[class-session] reuse session=${tailMatchId(sessionId)} ` +
        `reason=${reuseReason} members=${memberCount} ` +
        `class=${tailMatchId(params.classId)} source=hint_allow ` +
        `invalidReason=${localCheck.reason ?? "-"}`
    );
    return {
      ok: true,
      sessionId,
      sessionStatus,
      sessionCreatedAt,
      createdNewSession: false,
      reused: true,
      selectionReason: reuseReason,
    };
  }

  const reuseDespiteStale =
    localCheck.reason === "stale" &&
    (memberCount > 0 || (params.allowHintReuse && hintReusableStatus));

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

  if (params.allowHintReuse && hintReusableStatus) {
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
  const hintSessionId = String(
    params.hintSessionId ?? params.sessionId ?? ""
  ).trim();

  await expireStaleRecruitmentSessions(supabase, {
    classIds: [params.classId],
    ttlMinutes: params.recruitmentSessionTtlMinutes,
    keepSessionsWithMembers: true,
    excludeSessionIds: hintSessionId ? [hintSessionId] : [],
  });

  const classSessions = await listClassSessionsWithMembers(
    supabase,
    params.classId,
    deviceId
  );

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

  if (hintSessionId) {
    logRejectHintSession({
      sessionId: hintSessionId,
      classId: params.classId,
      reason: "create_fallback_no_valid_active",
      status: "-",
      memberCount: 0,
      matchDeadlineAt: params.matchDeadlineAt,
      sessionCreatedAt: null,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
      staleReason: "hint_not_reused_before_create_new",
    });
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
