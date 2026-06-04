import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveDisplayName } from "@/lib/resolveDisplayName";

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

export type ClassRepairApplyResult = {
  ok: true;
  ids: { classId: string; sessionId: string; deviceId: string };
  repaired: {
    membership: boolean;
    sessionMember: boolean;
    presence: boolean;
  };
  actions: string[];
  warnings: string[];
  diagnose: ClassRepairDiagnoseResult;
};

export async function repairClassMembership(input: {
  classId: string;
  sessionId: string;
  deviceId: string;
}): Promise<
  | { ok: false; error: string; details?: string[] }
  | ClassRepairApplyResult
> {
  const ids = normalizeIds(input);
  const validationErrors = validateIds(ids);
  if (validationErrors.length > 0) {
    return { ok: false, error: "invalid_params", details: validationErrors };
  }

  const diagnoseBefore = await diagnoseClassRepair(ids);
  if (!diagnoseBefore.ok) return diagnoseBefore;

  if (!diagnoseBefore.classExists) {
    return { ok: false, error: "class_not_found" };
  }
  if (!diagnoseBefore.sessionExists) {
    return { ok: false, error: "session_not_found" };
  }
  if (!diagnoseBefore.sessionClassMatches) {
    return { ok: false, error: "session_class_mismatch" };
  }

  console.log(
    `[admin-class-repair] repair-start class=${tailId(ids.classId)} ` +
      `session=${tailId(ids.sessionId)} device=${tailId(ids.deviceId)}`
  );

  const actions: string[] = [];
  const warnings = [...diagnoseBefore.warnings];
  const now = new Date().toISOString();
  const repaired = {
    membership: false,
    sessionMember: false,
    presence: false,
  };

  if (!diagnoseBefore.membershipExists) {
    const { error } = await supabaseAdmin.from("class_memberships").upsert(
      {
        class_id: ids.classId,
        device_id: ids.deviceId,
        joined_at: now,
      },
      { onConflict: "class_id,device_id" }
    );

    if (error) {
      return { ok: false, error: "membership_upsert_failed", details: [error.message] };
    }

    repaired.membership = true;
    actions.push("upsert_class_memberships");
    console.log(
      `[admin-class-repair] upsert membership class=${tailId(ids.classId)} device=${tailId(ids.deviceId)}`
    );
  }

  if (!diagnoseBefore.sessionMemberExists) {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("display_name")
      .eq("device_id", ids.deviceId)
      .maybeSingle();

    const resolved = resolveDisplayName({
      profileDisplayName: profile?.display_name,
      sessionMemberDisplayName: null,
    });

    const { error } = await supabaseAdmin.from("session_members").upsert(
      {
        session_id: ids.sessionId,
        device_id: ids.deviceId,
        display_name: resolved.displayName,
        joined_at: now,
        is_in_call: false,
      },
      { onConflict: "session_id,device_id" }
    );

    if (error) {
      return { ok: false, error: "session_member_upsert_failed", details: [error.message] };
    }

    repaired.sessionMember = true;
    actions.push("upsert_session_members");
    console.log(
      `[admin-class-repair] upsert session_member session=${tailId(ids.sessionId)} device=${tailId(ids.deviceId)}`
    );
  }

  const sessionStatus = String(diagnoseBefore.session?.status ?? "forming");
  const presenceStatus = sessionStatus === "active" ? "active" : "waiting";

  const { error: presenceError } = await supabaseAdmin.from("class_presence").upsert(
    {
      class_id: ids.classId,
      device_id: ids.deviceId,
      session_id: ids.sessionId,
      screen: "room",
      status: presenceStatus,
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "class_id,device_id" }
  );

  if (presenceError) {
    return {
      ok: false,
      error: "presence_upsert_failed",
      details: [presenceError.message],
    };
  }

  if (!diagnoseBefore.presenceExists) {
    actions.push("upsert_class_presence");
  } else {
    actions.push("refresh_class_presence");
  }
  repaired.presence = true;
  console.log(
    `[admin-class-repair] upsert presence class=${tailId(ids.classId)} session=${tailId(ids.sessionId)} device=${tailId(ids.deviceId)}`
  );

  const diagnoseAfter = await diagnoseClassRepair(ids);
  if (!diagnoseAfter.ok) {
    return { ok: false, error: "post_diagnose_failed" };
  }

  console.log(
    `[admin-class-repair] repair-done class=${tailId(ids.classId)} session=${tailId(ids.sessionId)} ` +
      `device=${tailId(ids.deviceId)} actions=${actions.join(",")}`
  );

  return {
    ok: true,
    ids,
    repaired,
    actions,
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
