import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureClassSessionMembership } from "@/lib/ensureClassSessionMembership";

const CLOSED_STATUSES = new Set(["closed", "ended", "expired"]);

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function tailId(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return "-";
  return v.length <= 8 ? v : v.slice(-6);
}

function normalizeIds(input: {
  classId: string;
  sessionId: string;
  deviceId: string;
}) {
  return {
    classId: String(input.classId ?? "").trim(),
    sessionId: String(input.sessionId ?? "").trim(),
    deviceId: String(input.deviceId ?? "").trim(),
  };
}

function validateIds(ids: ReturnType<typeof normalizeIds>) {
  const errors: string[] = [];
  if (!ids.classId || !isUuid(ids.classId)) errors.push("invalid_classId");
  if (!ids.sessionId || !isUuid(ids.sessionId)) errors.push("invalid_sessionId");
  if (!ids.deviceId || !isUuid(ids.deviceId)) errors.push("invalid_deviceId");
  return errors;
}

export type ClassRepairDiagnoseResult = {
  ok: true;
  ids: { classId: string; sessionId: string; deviceId: string };
  classExists: boolean;
  sessionExists: boolean;
  sessionClassMatches: boolean;
  membershipExists: boolean;
  sessionMemberExists: boolean;
  presenceExists: boolean;
  viewerInSessionMembers: boolean;
  counts: {
    classMemberships: number;
    sessionMembers: number;
    classPresence: number;
  };
  inconsistencies: string[];
  warnings: string[];
  possibleSplitSessions: Array<{
    sessionId: string;
    status: string;
    memberCount: number;
    createdAt: string | null;
    isTarget: boolean;
  }>;
  otherSessionsForDevice: Array<{
    sessionId: string;
    classId: string | null;
    joinedAt: string | null;
  }>;
  otherMembershipsForDevice: Array<{
    classId: string;
    joinedAt: string | null;
  }>;
  otherPresenceRows: Array<{
    classId: string;
    sessionId: string | null;
    screen: string | null;
    lastSeenAt: string | null;
  }>;
  session: {
    status: string | null;
    topic: string | null;
    classId: string | null;
  } | null;
  class: { name: string | null } | null;
};

export async function diagnoseClassRepair(input: {
  classId: string;
  sessionId: string;
  deviceId: string;
}): Promise<
  | { ok: false; error: string; details?: string[] }
  | ClassRepairDiagnoseResult
> {
  const ids = normalizeIds(input);
  const validationErrors = validateIds(ids);
  if (validationErrors.length > 0) {
    return { ok: false, error: "invalid_params", details: validationErrors };
  }

  console.log(
    `[admin-class-repair] diagnose class=${tailId(ids.classId)} ` +
      `session=${tailId(ids.sessionId)} device=${tailId(ids.deviceId)}`
  );

  const inconsistencies: string[] = [];
  const warnings: string[] = [];

  const { data: klass } = await supabaseAdmin
    .from("classes")
    .select("id,name")
    .eq("id", ids.classId)
    .maybeSingle();

  const classExists = Boolean(klass);

  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("id,class_id,status,topic,created_at")
    .eq("id", ids.sessionId)
    .maybeSingle();

  const sessionExists = Boolean(session);
  const sessionClassMatches =
    sessionExists && String(session?.class_id ?? "").trim() === ids.classId;

  if (sessionExists && !sessionClassMatches) {
    inconsistencies.push("session_class_mismatch");
  }

  const { data: membership } = await supabaseAdmin
    .from("class_memberships")
    .select("class_id,device_id,joined_at")
    .eq("class_id", ids.classId)
    .eq("device_id", ids.deviceId)
    .maybeSingle();

  const membershipExists = Boolean(membership);

  const { data: sessionMember } = await supabaseAdmin
    .from("session_members")
    .select("session_id,device_id,display_name,joined_at")
    .eq("session_id", ids.sessionId)
    .eq("device_id", ids.deviceId)
    .maybeSingle();

  const sessionMemberExists = Boolean(sessionMember);
  const viewerInSessionMembers = sessionMemberExists;

  const { data: presence } = await supabaseAdmin
    .from("class_presence")
    .select("class_id,device_id,session_id,screen,last_seen_at,status")
    .eq("class_id", ids.classId)
    .eq("device_id", ids.deviceId)
    .maybeSingle();

  const presenceExists = Boolean(presence);

  if (membershipExists && !sessionMemberExists) {
    inconsistencies.push("membership_without_session_member");
  }
  if (sessionMemberExists && !membershipExists) {
    inconsistencies.push("session_member_without_membership");
  }
  if (sessionMemberExists && !presenceExists) {
    inconsistencies.push("session_member_without_presence");
  }
  if (presenceExists && !sessionMemberExists) {
    inconsistencies.push("presence_without_session_member");
  }

  const { count: classMembershipsCount } = await supabaseAdmin
    .from("class_memberships")
    .select("*", { count: "exact", head: true })
    .eq("class_id", ids.classId);

  const { count: sessionMembersCount } = await supabaseAdmin
    .from("session_members")
    .select("*", { count: "exact", head: true })
    .eq("session_id", ids.sessionId);

  const { count: classPresenceCount } = await supabaseAdmin
    .from("class_presence")
    .select("*", { count: "exact", head: true })
    .eq("class_id", ids.classId);

  const { data: classSessions } = await supabaseAdmin
    .from("sessions")
    .select("id,status,created_at")
    .eq("class_id", ids.classId)
    .order("created_at", { ascending: false })
    .limit(30);

  const possibleSplitSessions: ClassRepairDiagnoseResult["possibleSplitSessions"] =
    [];

  for (const row of classSessions ?? []) {
    const sid = String(row.id ?? "").trim();
    if (!sid) continue;

    const status = String(row.status ?? "").trim();
    const isClosed = CLOSED_STATUSES.has(status.toLowerCase());

    const { count } = await supabaseAdmin
      .from("session_members")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sid);

    const memberCount = Number(count ?? 0);
    const isTarget = sid === ids.sessionId;

    if (!isTarget && memberCount > 0 && !isClosed) {
      warnings.push(`active_split_session:${tailId(sid)}`);
    }

    possibleSplitSessions.push({
      sessionId: sid,
      status,
      memberCount,
      createdAt: row.created_at ?? null,
      isTarget,
    });
  }

  const { data: otherSessionMembers } = await supabaseAdmin
    .from("session_members")
    .select("session_id,joined_at")
    .eq("device_id", ids.deviceId)
    .neq("session_id", ids.sessionId)
    .limit(20);

  const otherSessionsForDevice: ClassRepairDiagnoseResult["otherSessionsForDevice"] =
    [];

  for (const row of otherSessionMembers ?? []) {
    const otherSessionId = String(row.session_id ?? "").trim();
    if (!otherSessionId) continue;

    const { data: otherSession } = await supabaseAdmin
      .from("sessions")
      .select("class_id")
      .eq("id", otherSessionId)
      .maybeSingle();

    otherSessionsForDevice.push({
      sessionId: otherSessionId,
      classId: otherSession?.class_id ?? null,
      joinedAt: row.joined_at ?? null,
    });

    warnings.push(`device_in_other_session:${tailId(otherSessionId)}`);
  }

  const { data: otherMemberships } = await supabaseAdmin
    .from("class_memberships")
    .select("class_id,joined_at")
    .eq("device_id", ids.deviceId)
    .neq("class_id", ids.classId)
    .limit(20);

  const otherMembershipsForDevice = (otherMemberships ?? []).map((row) => ({
    classId: String(row.class_id ?? ""),
    joinedAt: row.joined_at ?? null,
  }));

  for (const row of otherMembershipsForDevice) {
    if (row.classId) {
      warnings.push(`device_in_other_class:${tailId(row.classId)}`);
    }
  }
  if (otherMembershipsForDevice.length > 0) {
    warnings.push("device_has_other_class_memberships");
  }

  const { data: presenceRows } = await supabaseAdmin
    .from("class_presence")
    .select("class_id,session_id,screen,last_seen_at")
    .eq("device_id", ids.deviceId)
    .order("last_seen_at", { ascending: false })
    .limit(10);

  const otherPresenceRows = (presenceRows ?? [])
    .filter((row) => String(row.class_id ?? "") !== ids.classId)
    .map((row) => ({
      classId: String(row.class_id ?? ""),
      sessionId: row.session_id ?? null,
      screen: row.screen ?? null,
      lastSeenAt: row.last_seen_at ?? null,
    }));

  if (
    presence &&
    String(presence.session_id ?? "").trim() &&
    String(presence.session_id ?? "").trim() !== ids.sessionId
  ) {
    inconsistencies.push("presence_session_mismatch");
  }

  return {
    ok: true,
    ids,
    classExists,
    sessionExists,
    sessionClassMatches,
    membershipExists,
    sessionMemberExists,
    presenceExists,
    viewerInSessionMembers,
    counts: {
      classMemberships: Number(classMembershipsCount ?? 0),
      sessionMembers: Number(sessionMembersCount ?? 0),
      classPresence: Number(classPresenceCount ?? 0),
    },
    inconsistencies,
    warnings,
    possibleSplitSessions,
    otherSessionsForDevice,
    otherMembershipsForDevice,
    otherPresenceRows,
    session: session
      ? {
          status: session.status ?? null,
          topic: session.topic ?? null,
          classId: session.class_id ?? null,
        }
      : null,
    class: klass ? { name: klass.name ?? null } : null,
  };
}

export type RepairStepId =
  | "class_memberships"
  | "session_members"
  | "class_presence";

export type RepairStepStatus =
  | "skipped"
  | "planned"
  | "applied"
  | "failed";

export type RepairStepResult = {
  step: RepairStepId;
  status: RepairStepStatus;
  action?: string;
  error?: string;
};

export type ClassRepairApplyResult = {
  ok: true;
  ids: { classId: string; sessionId: string; deviceId: string };
  dryRun: boolean;
  status: "dry_run" | "completed" | "partial";
  repaired: {
    membership: boolean;
    sessionMember: boolean;
    presence: boolean;
  };
  planned: string[];
  actions: string[];
  steps: RepairStepResult[];
  warnings: string[];
  failedStep?: RepairStepId;
  failedError?: string;
  diagnose: ClassRepairDiagnoseResult;
};

export type ClassRepairBlockedResult = {
  ok: false;
  error: string;
  status: "blocked";
  details?: string[];
  sessionClassId?: string | null;
  requestedClassId?: string;
  warnings?: string[];
  diagnose?: ClassRepairDiagnoseResult;
};

function buildRepairPlan(diagnose: ClassRepairDiagnoseResult): string[] {
  const planned: string[] = [];

  if (!diagnose.membershipExists) {
    planned.push("upsert_class_memberships");
  }
  if (!diagnose.sessionMemberExists) {
    planned.push("upsert_session_members");
  }
  if (!diagnose.presenceExists) {
    planned.push("upsert_class_presence");
  } else {
    planned.push("refresh_class_presence");
  }

  return planned;
}

async function assertSessionClassMatch(ids: {
  classId: string;
  sessionId: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "session_class_mismatch";
      sessionClassId: string | null;
      requestedClassId: string;
    }
> {
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("id,class_id")
    .eq("id", ids.sessionId)
    .maybeSingle();

  if (!session) {
    return { ok: false, error: "session_class_mismatch", sessionClassId: null, requestedClassId: ids.classId };
  }

  const sessionClassId = String(session.class_id ?? "").trim() || null;

  if (sessionClassId !== ids.classId) {
    console.warn(
      `[admin-class-repair] session_class_mismatch session=${tailId(ids.sessionId)} ` +
        `expected=${tailId(ids.classId)} actual=${tailId(sessionClassId ?? "")}`
    );
    return {
      ok: false,
      error: "session_class_mismatch",
      sessionClassId,
      requestedClassId: ids.classId,
    };
  }

  return { ok: true };
}

export async function repairClassMembership(input: {
  classId: string;
  sessionId: string;
  deviceId: string;
  dryRun?: boolean;
}): Promise<
  | ClassRepairBlockedResult
  | ClassRepairApplyResult
> {
  const ids = normalizeIds(input);
  const dryRun = input.dryRun === true;
  const validationErrors = validateIds(ids);
  if (validationErrors.length > 0) {
    return {
      ok: false,
      error: "invalid_params",
      status: "blocked",
      details: validationErrors,
    };
  }

  const diagnoseBefore = await diagnoseClassRepair(ids);
  if (!diagnoseBefore.ok) {
    return {
      ok: false,
      error: diagnoseBefore.error,
      status: "blocked",
      details: diagnoseBefore.details,
    };
  }

  const warnings = [...diagnoseBefore.warnings];

  if (!diagnoseBefore.classExists) {
    return {
      ok: false,
      error: "class_not_found",
      status: "blocked",
      warnings,
      diagnose: diagnoseBefore,
    };
  }
  if (!diagnoseBefore.sessionExists) {
    return {
      ok: false,
      error: "session_not_found",
      status: "blocked",
      warnings,
      diagnose: diagnoseBefore,
    };
  }

  const classMatch = await assertSessionClassMatch(ids);
  if (!classMatch.ok) {
    return {
      ok: false,
      error: classMatch.error,
      status: "blocked",
      sessionClassId: classMatch.sessionClassId,
      requestedClassId: classMatch.requestedClassId,
      warnings,
      diagnose: diagnoseBefore,
    };
  }

  if (!diagnoseBefore.sessionClassMatches) {
    return {
      ok: false,
      error: "session_class_mismatch",
      status: "blocked",
      sessionClassId: diagnoseBefore.session?.classId ?? null,
      requestedClassId: ids.classId,
      warnings,
      diagnose: diagnoseBefore,
    };
  }

  const planned = buildRepairPlan(diagnoseBefore);
  const steps: RepairStepResult[] = [];
  const actions: string[] = [];
  const repaired = {
    membership: false,
    sessionMember: false,
    presence: false,
  };

  console.log(
    `[admin-class-repair] ${dryRun ? "dry-run" : "repair-start"} class=${tailId(ids.classId)} ` +
      `session=${tailId(ids.sessionId)} device=${tailId(ids.deviceId)} planned=${planned.join(",")}`
  );

  if (dryRun) {
    for (const action of planned) {
      const step: RepairStepId =
        action === "upsert_class_memberships"
          ? "class_memberships"
          : action === "upsert_session_members"
            ? "session_members"
            : "class_presence";

      steps.push({
        step,
        status: "planned",
        action,
      });
    }

    return {
      ok: true,
      ids,
      dryRun: true,
      status: "dry_run",
      repaired,
      planned,
      actions: planned,
      steps,
      warnings,
      diagnose: diagnoseBefore,
    };
  }

  const ensureRes = await ensureClassSessionMembership({
    classId: ids.classId,
    sessionId: ids.sessionId,
    deviceId: ids.deviceId,
    source: "restore",
  });

  if (!ensureRes.ok) {
    if (ensureRes.status === "blocked") {
      return {
        ok: false,
        error: ensureRes.error,
        status: "blocked",
        sessionClassId: ensureRes.sessionClassId,
        requestedClassId: ensureRes.requestedClassId,
        warnings,
        diagnose: diagnoseBefore,
      };
    }

    const failedStep = ensureRes.failedStep ?? "class_presence";
    return {
      ok: true,
      ids,
      dryRun: false,
      status: "partial",
      repaired,
      planned,
      actions,
      steps: ensureRes.steps ?? steps,
      warnings: [...warnings, ...(ensureRes.details ?? [])],
      failedStep,
      failedError: ensureRes.details?.[0] ?? ensureRes.error,
      diagnose: diagnoseBefore,
    };
  }

  for (const step of ensureRes.steps) {
    const repairStep: RepairStepResult = {
      step: step.step,
      status: step.status === "failed" ? "failed" : step.status === "applied" ? "applied" : "skipped",
      action: step.action,
      error: step.error,
    };
    steps.push(repairStep);
    if (step.action) actions.push(step.action);
  }

  repaired.membership = ensureRes.membershipUpserted;
  repaired.sessionMember = ensureRes.sessionMemberUpserted;
  repaired.presence = ensureRes.presenceUpserted;
  warnings.push(...ensureRes.warnings);

  const diagnoseAfter = await diagnoseClassRepair(ids);
  if (!diagnoseAfter.ok) {
    return {
      ok: true,
      ids,
      dryRun: false,
      status: "partial",
      repaired,
      planned,
      actions,
      steps,
      warnings,
      failedStep: "class_presence",
      failedError: "post_diagnose_failed",
      diagnose: diagnoseBefore,
    };
  }

  console.log(
    `[admin-class-repair] repair-done class=${tailId(ids.classId)} session=${tailId(ids.sessionId)} ` +
      `device=${tailId(ids.deviceId)} actions=${actions.join(",")}`
  );

  return {
    ok: true,
    ids,
    dryRun: false,
    status: "completed",
    repaired,
    planned,
    actions,
    steps,
    warnings,
    diagnose: diagnoseAfter,
  };
}

export async function diagnoseSessionSummary(sessionId: string, classId: string) {
  const sid = String(sessionId ?? "").trim();
  const cid = String(classId ?? "").trim();

  if (!sid || !cid) {
    return null;
  }

  const { count: sessionMembers } = await supabaseAdmin
    .from("session_members")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sid);

  const { count: classMemberships } = await supabaseAdmin
    .from("class_memberships")
    .select("*", { count: "exact", head: true })
    .eq("class_id", cid);

  const { count: classPresence } = await supabaseAdmin
    .from("class_presence")
    .select("*", { count: "exact", head: true })
    .eq("class_id", cid);

  const { data: sessions } = await supabaseAdmin
    .from("sessions")
    .select("id,status,created_at")
    .eq("class_id", cid)
    .order("created_at", { ascending: false })
    .limit(10);

  const splitCandidates: Array<{
    sessionId: string;
    status: string;
    memberCount: number;
  }> = [];

  for (const row of sessions ?? []) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const { count } = await supabaseAdmin
      .from("session_members")
      .select("*", { count: "exact", head: true })
      .eq("session_id", id);

    splitCandidates.push({
      sessionId: id,
      status: String(row.status ?? ""),
      memberCount: Number(count ?? 0),
    });
  }

  const activeSplits = splitCandidates.filter(
    (s) => s.sessionId !== sid && s.memberCount > 0 && !CLOSED_STATUSES.has(s.status.toLowerCase())
  );

  return {
    sessionMembers: Number(sessionMembers ?? 0),
    classMemberships: Number(classMemberships ?? 0),
    classPresence: Number(classPresence ?? 0),
    possibleSplitSessions: activeSplits.length,
    splitCandidates,
  };
}
