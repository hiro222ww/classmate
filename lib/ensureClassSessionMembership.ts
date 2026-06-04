import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  auditJoinStateInvariants,
  tailJoinId,
} from "@/lib/joinStateInvariants";
import { resolveDisplayName } from "@/lib/resolveDisplayName";

export type JoinStateSource = "invite" | "normal_join" | "rejoin" | "restore";

export type JoinStateStepId =
  | "class_memberships"
  | "session_members"
  | "class_presence";

export type JoinStateStepResult = {
  step: JoinStateStepId;
  status: "skipped" | "applied" | "failed";
  action?: string;
  error?: string;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export { tailJoinId };

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

export type EnsureClassSessionMembershipInput = {
  classId: string;
  sessionId: string;
  deviceId: string;
  source: JoinStateSource;
  displayName?: string;
  client?: SupabaseClient;
};

export type EnsureClassSessionMembershipSuccess = {
  ok: true;
  ids: { classId: string; sessionId: string; deviceId: string };
  source: JoinStateSource;
  classExists: boolean;
  sessionExists: boolean;
  sessionClassMatches: boolean;
  membershipUpserted: boolean;
  sessionMemberUpserted: boolean;
  presenceUpserted: boolean;
  selfHealed: string[];
  steps: JoinStateStepResult[];
  warnings: string[];
};

export type EnsureClassSessionMembershipFailure = {
  ok: false;
  error: string;
  status: "blocked" | "partial";
  sessionClassId?: string | null;
  requestedClassId?: string;
  steps?: JoinStateStepResult[];
  failedStep?: JoinStateStepId;
  details?: string[];
};

export async function ensureClassSessionMembership(
  input: EnsureClassSessionMembershipInput
): Promise<
  EnsureClassSessionMembershipSuccess | EnsureClassSessionMembershipFailure
> {
  const sb = input.client ?? supabaseAdmin;
  const ids = normalizeIds(input);
  const source = input.source;
  const steps: JoinStateStepResult[] = [];
  const selfHealed: string[] = [];
  const warnings: string[] = [];

  const invalid: string[] = [];
  if (!ids.classId || !isUuid(ids.classId)) invalid.push("invalid_classId");
  if (!ids.sessionId || !isUuid(ids.sessionId)) invalid.push("invalid_sessionId");
  if (!ids.deviceId || !isUuid(ids.deviceId)) invalid.push("invalid_deviceId");

  if (invalid.length > 0) {
    return {
      ok: false,
      error: "invalid_params",
      status: "blocked",
      details: invalid,
    };
  }

  console.log(
    `[join-state] ensure source=${source} class=${tailJoinId(ids.classId)} ` +
      `session=${tailJoinId(ids.sessionId)} device=${tailJoinId(ids.deviceId)}`
  );

  const { data: klass, error: classError } = await sb
    .from("classes")
    .select("id")
    .eq("id", ids.classId)
    .maybeSingle();

  if (classError) {
    return {
      ok: false,
      error: "class_lookup_failed",
      status: "blocked",
      details: [classError.message],
    };
  }

  if (!klass) {
    return { ok: false, error: "class_not_found", status: "blocked" };
  }

  const { data: session, error: sessionError } = await sb
    .from("sessions")
    .select("id,class_id,status")
    .eq("id", ids.sessionId)
    .maybeSingle();

  if (sessionError) {
    return {
      ok: false,
      error: "session_lookup_failed",
      status: "blocked",
      details: [sessionError.message],
    };
  }

  if (!session) {
    return { ok: false, error: "session_not_found", status: "blocked" };
  }

  const sessionClassId = String(session.class_id ?? "").trim() || null;

  if (sessionClassId !== ids.classId) {
    console.warn(
      `[join-state] mismatch sessionClass=${tailJoinId(sessionClassId ?? "")} ` +
        `requestedClass=${tailJoinId(ids.classId)} session=${tailJoinId(ids.sessionId)}`
    );
    return {
      ok: false,
      error: "session_class_mismatch",
      status: "blocked",
      sessionClassId,
      requestedClassId: ids.classId,
    };
  }

  const preWarnings = await auditJoinStateInvariants(sb, {
    classId: ids.classId,
    sessionId: ids.sessionId,
    deviceId: ids.deviceId,
    sessionClassId,
  });
  warnings.push(...preWarnings);

  const { data: existingMembership } = await sb
    .from("class_memberships")
    .select("class_id")
    .eq("class_id", ids.classId)
    .eq("device_id", ids.deviceId)
    .maybeSingle();

  const { data: existingSessionMember } = await sb
    .from("session_members")
    .select("session_id")
    .eq("session_id", ids.sessionId)
    .eq("device_id", ids.deviceId)
    .maybeSingle();

  const { data: existingPresence } = await sb
    .from("class_presence")
    .select("class_id")
    .eq("class_id", ids.classId)
    .eq("device_id", ids.deviceId)
    .maybeSingle();

  if (existingMembership && !existingSessionMember) {
    selfHealed.push("membership_without_session_member");
  }
  if (existingSessionMember && !existingPresence) {
    selfHealed.push("session_member_without_presence");
  }
  if (existingPresence && !existingSessionMember) {
    warnings.push("presence_without_session_member");
    if (source === "invite" || source === "normal_join" || source === "rejoin" || source === "restore") {
      selfHealed.push("presence_without_session_member");
    }
  }

  const now = new Date().toISOString();
  let membershipUpserted = false;
  let sessionMemberUpserted = false;
  let presenceUpserted = false;

  {
    const { error } = await sb.from("class_memberships").upsert(
      {
        class_id: ids.classId,
        device_id: ids.deviceId,
        joined_at: now,
      },
      { onConflict: "class_id,device_id" }
    );

    if (error) {
      steps.push({
        step: "class_memberships",
        status: "failed",
        action: "upsert_class_memberships",
        error: error.message,
      });
      return {
        ok: false,
        error: "membership_upsert_failed",
        status: "partial",
        steps,
        failedStep: "class_memberships",
        details: [error.message],
      };
    }

    membershipUpserted = !existingMembership;
    steps.push({
      step: "class_memberships",
      status: "applied",
      action: "upsert_class_memberships",
    });
    console.log(
      `[join-state] step=class_memberships applied class=${tailJoinId(ids.classId)} device=${tailJoinId(ids.deviceId)}`
    );
  }

  let displayName = String(input.displayName ?? "").trim();
  if (!displayName) {
    const { data: profile } = await sb
      .from("user_profiles")
      .select("display_name")
      .eq("device_id", ids.deviceId)
      .maybeSingle();

    displayName = resolveDisplayName({
      profileDisplayName: profile?.display_name,
      sessionMemberDisplayName: null,
    }).displayName;
  }

  {
    const { error } = await sb.from("session_members").upsert(
      {
        session_id: ids.sessionId,
        device_id: ids.deviceId,
        display_name: displayName,
        joined_at: now,
        is_in_call: false,
      },
      { onConflict: "session_id,device_id" }
    );

    if (error) {
      steps.push({
        step: "session_members",
        status: "failed",
        action: "upsert_session_members",
        error: error.message,
      });
      return {
        ok: false,
        error: "session_member_upsert_failed",
        status: "partial",
        steps,
        failedStep: "session_members",
        details: [error.message],
        sessionClassId,
        requestedClassId: ids.classId,
      };
    }

    sessionMemberUpserted = !existingSessionMember;
    steps.push({
      step: "session_members",
      status: "applied",
      action: "upsert_session_members",
    });
    console.log(
      `[join-state] step=session_members applied session=${tailJoinId(ids.sessionId)} device=${tailJoinId(ids.deviceId)}`
    );
  }

  const sessionStatus = String(session.status ?? "forming");
  const presenceStatus = sessionStatus === "active" ? "active" : "waiting";
  const presenceAction = existingPresence ? "refresh_class_presence" : "upsert_class_presence";

  {
    const { error } = await sb.from("class_presence").upsert(
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

    if (error) {
      steps.push({
        step: "class_presence",
        status: "failed",
        action: presenceAction,
        error: error.message,
      });
      return {
        ok: false,
        error: "presence_upsert_failed",
        status: "partial",
        steps,
        failedStep: "class_presence",
        details: [error.message],
      };
    }

    presenceUpserted = true;
    steps.push({
      step: "class_presence",
      status: "applied",
      action: presenceAction,
    });
    console.log(
      `[join-state] step=class_presence applied class=${tailJoinId(ids.classId)} session=${tailJoinId(ids.sessionId)} device=${tailJoinId(ids.deviceId)}`
    );
  }

  const postWarnings = await auditJoinStateInvariants(sb, {
    classId: ids.classId,
    sessionId: ids.sessionId,
    deviceId: ids.deviceId,
    sessionClassId,
  });
  warnings.push(...postWarnings);

  console.log(
    `[join-state] ensure-done source=${source} class=${tailJoinId(ids.classId)} ` +
      `session=${tailJoinId(ids.sessionId)} device=${tailJoinId(ids.deviceId)} ` +
      `membership=${membershipUpserted} sessionMember=${sessionMemberUpserted} presence=${presenceUpserted}`
  );

  return {
    ok: true,
    ids,
    source,
    classExists: true,
    sessionExists: true,
    sessionClassMatches: true,
    membershipUpserted,
    sessionMemberUpserted,
    presenceUpserted,
    selfHealed,
    steps,
    warnings,
  };
}
