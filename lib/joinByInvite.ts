import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getBillableMembershipSnapshot } from "@/lib/classMembershipSlots";
import { ensureClassSessionMembership } from "@/lib/ensureClassSessionMembership";
import { resolveInviteJoinSession } from "@/lib/inviteJoinSession";
import { isDeadlinePassed } from "@/lib/recruitment";
import { getRecruitmentSessionTtlMinutes } from "@/lib/recruitmentSettings";
import { enforceDeviceJoinAge } from "@/lib/joinAgeGuard";
import {
  hasClassMembershipForActor,
  profileExistsForActor,
  resolveApiActor,
  getClassSlotsForActor,
} from "@/lib/actorIdentity";
import {
  assertDeviceBootstrapAllowed,
  DeviceOwnershipError,
} from "@/lib/deviceOwnership";
import { hasLinkedEmailFromAuthUser } from "@/lib/userIdentity";
import { verifySupabaseAccessToken } from "@/lib/requestIdentity";
import { resolveUserIdForDevice } from "@/lib/userIdentityMigration";
import { logInviteJoinServer } from "@/lib/joinByInviteLog";
import {
  buildInviteRoomRedirect,
  joinByInviteUserMessage,
  mapLegacyInviteError,
  type JoinByInviteFailure,
  type JoinByInviteResult,
  type JoinByInviteSuccess,
} from "@/lib/joinByInviteTypes";
import { isJoinAllowedDeviceId } from "@/lib/deviceIdValidation";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function failure(
  requestId: string,
  partial: Omit<JoinByInviteFailure, "ok" | "requestId">
): JoinByInviteFailure {
  logInviteJoinServer("failed", {
    requestId,
    classId: partial.classId,
    sessionId: partial.sessionId,
    code: partial.code,
    action: partial.action ?? null,
    detail: partial.detail ?? partial.message,
    step: "result",
  });
  return { ok: false, requestId, ...partial };
}

function success(
  requestId: string,
  partial: Omit<JoinByInviteSuccess, "ok" | "requestId" | "message">
): JoinByInviteSuccess {
  const result: JoinByInviteSuccess = {
    ok: true,
    requestId,
    message: joinByInviteUserMessage(partial.code),
    ...partial,
  };
  logInviteJoinServer("success", {
    requestId,
    classId: result.classId,
    sessionId: result.sessionId,
    requestedSessionId: result.requestedSessionId,
    deviceId: result.deviceId,
    userId: result.userId,
    code: result.code,
    upsertOk: true,
    existingMembership: result.code === "already_member",
  });
  return result;
}

async function countSessionMembers(
  sb: SupabaseClient,
  sessionId: string
): Promise<number> {
  const { count, error } = await sb
    .from("session_members")
    .select("device_id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (error) throw error;
  return Number(count ?? 0);
}

async function resolveDisplayName(
  sb: SupabaseClient,
  actor: { userId: string | null; deviceId: string }
) {
  const userId = String(actor.userId ?? "").trim();
  const deviceId = String(actor.deviceId ?? "").trim();

  if (userId) {
    const { data } = await sb
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    const name = String(data?.display_name ?? "").trim();
    if (name) return name;
  }

  if (deviceId) {
    const { data } = await sb
      .from("user_profiles")
      .select("display_name")
      .eq("device_id", deviceId)
      .maybeSingle();
    const name = String(data?.display_name ?? "").trim();
    if (name) return name;
  }

  return "参加者";
}

async function backfillMembershipUserIdIfSafe(
  sb: SupabaseClient,
  actor: { userId: string | null; deviceId: string },
  classId: string
) {
  const userId = String(actor.userId ?? "").trim();
  const deviceId = String(actor.deviceId ?? "").trim();
  if (!userId || !deviceId) return;

  const { data: row } = await sb
    .from("class_memberships")
    .select("user_id,device_id")
    .eq("class_id", classId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (row && !row.user_id) {
    await sb
      .from("class_memberships")
      .update({ user_id: userId })
      .eq("class_id", classId)
      .eq("device_id", deviceId)
      .is("user_id", null);
  }
}

export type ExecuteJoinByInviteInput = {
  req: Request;
  body: Record<string, unknown>;
  client?: SupabaseClient;
};

export async function executeJoinByInvite(
  input: ExecuteJoinByInviteInput
): Promise<{ result: JoinByInviteResult; httpStatus: number }> {
  const requestId = randomUUID();
  const sb = input.client ?? supabaseAdmin;
  const body = input.body ?? {};

  const classId = String(body.classId ?? "").trim();
  const requestedSessionId = String(body.sessionId ?? "").trim();
  const deviceId = String(body.deviceId ?? "").trim();

  logInviteJoinServer("start", {
    requestId,
    classId,
    requestedSessionId,
    deviceId,
    step: "request",
  });

  if (!classId || !requestedSessionId || !deviceId) {
    return {
      httpStatus: 400,
      result: failure(requestId, {
        code: "invalid_invite",
        message: joinByInviteUserMessage("invalid_invite"),
        classId: classId || undefined,
        sessionId: requestedSessionId || undefined,
        detail: "missing_params",
      }),
    };
  }

  if (!isUuid(classId) || !isUuid(requestedSessionId) || !isJoinAllowedDeviceId(deviceId)) {
    return {
      httpStatus: 400,
      result: failure(requestId, {
        code: "invalid_invite",
        message: joinByInviteUserMessage("invalid_invite"),
        classId,
        sessionId: requestedSessionId,
        detail: "invalid_ids",
      }),
    };
  }

  const actorResult = await resolveApiActor({
    req: input.req,
    deviceId,
  });

  if (!actorResult.ok) {
    const mapped = mapLegacyInviteError(actorResult.error);
    const code =
      actorResult.error === "device_user_mismatch"
        ? "restore_login"
        : mapped;
    return {
      httpStatus: actorResult.status,
      result: failure(requestId, {
        code,
        message: actorResult.message ?? joinByInviteUserMessage(code),
        classId,
        sessionId: requestedSessionId,
        detail: actorResult.error,
        redirectTo: code === "restore_login" ? "/login" : undefined,
        action: code === "restore_login" ? "restore_login" : null,
      }),
    };
  }

  let userId = String(actorResult.actor.userId ?? "").trim();
  if (!userId) {
    userId = (await resolveUserIdForDevice(deviceId)) ?? "";
  }

  const actor = { userId: userId || null, deviceId };

  logInviteJoinServer("step", {
    requestId,
    classId,
    requestedSessionId,
    deviceId,
    userId: actor.userId,
    step: "actor_resolved",
  });

  const token =
    input.req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    "";
  if (token) {
    const verified = await verifySupabaseAccessToken(token);
    if (verified.user) {
      try {
        await assertDeviceBootstrapAllowed({
          req: input.req,
          userId: verified.user.id,
          deviceId,
          bodySecret: body.deviceSecret,
          hasLinkedEmail: hasLinkedEmailFromAuthUser(verified.user),
          allowSecretReregistration: body.reregisterDevice === true,
        });
      } catch (error) {
        if (error instanceof DeviceOwnershipError) {
          const code =
            error.action === "reregister_device"
              ? "reregister_device"
              : "restore_login";
          return {
            httpStatus: 403,
            result: failure(requestId, {
              code,
              message: error.message || joinByInviteUserMessage(code),
              classId,
              sessionId: requestedSessionId,
              detail: error.code,
              action: error.action ?? null,
              redirectTo: code === "restore_login" ? "/login" : undefined,
            }),
          };
        }
        throw error;
      }
    }
  }

  const hasProfile = await profileExistsForActor(sb, actor);
  logInviteJoinServer("step", {
    requestId,
    classId,
    deviceId,
    userId: actor.userId,
    hasProfile,
    step: "profile_check",
  });

  if (!hasProfile) {
    return {
      httpStatus: 409,
      result: failure(requestId, {
        code: "needs_profile",
        message: joinByInviteUserMessage("needs_profile"),
        classId,
        sessionId: requestedSessionId,
        redirectTo: "/profile",
      }),
    };
  }

  const { data: klass, error: classError } = await sb
    .from("classes")
    .select("id,name,match_deadline_at")
    .eq("id", classId)
    .maybeSingle();

  if (classError) {
    return {
      httpStatus: 500,
      result: failure(requestId, {
        code: "server_error",
        message: joinByInviteUserMessage("server_error"),
        classId,
        sessionId: requestedSessionId,
        detail: classError.message,
      }),
    };
  }

  if (!klass) {
    return {
      httpStatus: 404,
      result: failure(requestId, {
        code: "invalid_invite",
        message: joinByInviteUserMessage("invalid_invite"),
        classId,
        sessionId: requestedSessionId,
        detail: "class_not_found",
      }),
    };
  }

  let alreadyMember = false;
  try {
    alreadyMember = await hasClassMembershipForActor(sb, actor, classId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      httpStatus: 500,
      result: failure(requestId, {
        code: "server_error",
        message: joinByInviteUserMessage("server_error"),
        classId,
        sessionId: requestedSessionId,
        detail: message,
      }),
    };
  }

  logInviteJoinServer("step", {
    requestId,
    classId,
    deviceId,
    userId: actor.userId,
    existingMembership: alreadyMember,
    step: "membership_check",
  });

  if (!alreadyMember) {
    const ageGuard = await enforceDeviceJoinAge(deviceId, actor.userId);
    logInviteJoinServer("step", {
      requestId,
      classId,
      deviceId,
      userId: actor.userId,
      ageGuardOk: ageGuard.ok,
      step: "age_guard",
    });

    if (!ageGuard.ok) {
      return {
        httpStatus: ageGuard.error === "profile_age_required" ? 400 : 403,
        result: failure(requestId, {
          code: "age_restricted",
          message: ageGuard.message || joinByInviteUserMessage("age_restricted"),
          classId,
          sessionId: requestedSessionId,
          detail: ageGuard.error,
        }),
      };
    }

    const slotsRes = await getClassSlotsForActor(sb, actor);
    if (!slotsRes.ok) {
      return {
        httpStatus: 500,
        result: failure(requestId, {
          code: "server_error",
          message: joinByInviteUserMessage("server_error"),
          classId,
          sessionId: requestedSessionId,
          detail: slotsRes.error,
        }),
      };
    }

    const billableRes = await getBillableMembershipSnapshot(
      sb,
      deviceId,
      actor.userId
    );
    if (!billableRes.ok) {
      return {
        httpStatus: 500,
        result: failure(requestId, {
          code: "server_error",
          message: joinByInviteUserMessage("server_error"),
          classId,
          sessionId: requestedSessionId,
          detail: billableRes.error,
        }),
      };
    }

    const atSlotLimit =
      billableRes.snapshot.billableCount >= slotsRes.classSlots &&
      !billableRes.snapshot.billableClassIds.includes(classId);

    logInviteJoinServer("step", {
      requestId,
      classId,
      deviceId,
      userId: actor.userId,
      classSlotsOk: !atSlotLimit,
      step: "slot_check",
      detail: `count=${billableRes.snapshot.billableCount} limit=${slotsRes.classSlots}`,
    });

    if (atSlotLimit) {
      return {
        httpStatus: 403,
        result: failure(requestId, {
          code: "class_full",
          message: joinByInviteUserMessage("class_full"),
          classId,
          sessionId: requestedSessionId,
          detail: "class_slots_limit",
        }),
      };
    }
  }

  if (isDeadlinePassed(klass.match_deadline_at ?? null)) {
    return {
      httpStatus: 403,
      result: failure(requestId, {
        code: "expired_invite",
        message: joinByInviteUserMessage("expired_invite"),
        classId,
        sessionId: requestedSessionId,
        detail: "match_deadline_passed",
      }),
    };
  }

  const recruitmentSessionTtlMinutes = await getRecruitmentSessionTtlMinutes();
  const resolved = await resolveInviteJoinSession({
    client: sb,
    classId,
    requestedSessionId,
    deviceId,
    matchDeadlineAt: klass.match_deadline_at ?? null,
    recruitmentSessionTtlMinutes,
  });

  logInviteJoinServer("step", {
    requestId,
    classId,
    requestedSessionId,
    deviceId,
    userId: actor.userId,
    inviteValid: resolved.ok,
    step: "invite_session_resolve",
    detail: resolved.ok ? resolved.reason : resolved.error,
  });

  if (!resolved.ok) {
    const code = mapLegacyInviteError(resolved.error);
    return {
      httpStatus: resolved.error === "recruitment_closed" ? 403 : 400,
      result: failure(requestId, {
        code: code === "server_error" ? "expired_invite" : code,
        message: joinByInviteUserMessage(
          code === "server_error" ? "expired_invite" : code
        ),
        classId,
        sessionId: requestedSessionId,
        detail: resolved.error,
      }),
    };
  }

  const sessionId = resolved.sessionId;
  const displayName = await resolveDisplayName(sb, actor);

  await backfillMembershipUserIdIfSafe(sb, actor, classId);

  const joinState = await ensureClassSessionMembership({
    classId,
    sessionId,
    deviceId,
    userId: actor.userId,
    source: "invite",
    displayName,
    client: sb,
  });

  logInviteJoinServer("step", {
    requestId,
    classId,
    sessionId,
    deviceId,
    userId: actor.userId,
    upsertOk: joinState.ok,
    step: "ensure_membership",
    detail: joinState.ok ? undefined : joinState.error,
  });

  if (!joinState.ok) {
    if (joinState.error === "session_class_mismatch") {
      return {
        httpStatus: 409,
        result: failure(requestId, {
          code: "invalid_invite",
          message: joinByInviteUserMessage("invalid_invite"),
          classId,
          sessionId,
          detail: joinState.error,
        }),
      };
    }

    const details = joinState.details?.join("; ") ?? joinState.error;
    return {
      httpStatus: joinState.status === "partial" ? 207 : 400,
      result: failure(requestId, {
        code: "server_error",
        message: joinByInviteUserMessage("server_error"),
        classId,
        sessionId,
        detail: details,
      }),
    };
  }

  let memberCount = resolved.memberCount;
  try {
    memberCount = await countSessionMembers(sb, sessionId);
  } catch (error) {
    console.warn("[invite-join] member_count_failed", error);
  }

  const { data: sessionRow } = await sb
    .from("sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();

  const resultCode = alreadyMember ? "already_member" : "joined";
  const redirectTo = buildInviteRoomRedirect({
    classId,
    sessionId,
    invite: false,
  });

  return {
    httpStatus: 200,
    result: success(requestId, {
      code: resultCode,
      classId,
      sessionId,
      requestedSessionId,
      redirectTo,
      className: String(klass.name ?? "").trim() || "クラス",
      displayName,
      userId: actor.userId,
      deviceId,
      memberCount,
      sessionStatus: String(sessionRow?.status ?? resolved.sessionStatus ?? null),
      sessionFallback: resolved.sessionFallback,
      sessionReactivated: resolved.sessionReactivated,
      sessionFallbackReason: resolved.reason ?? null,
    }),
  };
}
