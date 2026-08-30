import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateClassSlotsLimit } from "@/lib/classMembershipSlots";
import { ensureClassSessionMembership } from "@/lib/ensureClassSessionMembership";
import { resolveInviteJoinSession } from "@/lib/inviteJoinSession";
import { isDeadlinePassed } from "@/lib/recruitment";
import { getRecruitmentSessionTtlMinutes } from "@/lib/recruitmentSettings";
import { enforceDeviceJoinAge } from "@/lib/joinAgeGuard";
import { resolveOpsTestFlags } from "@/lib/opsTestMode";
import { shouldBypassJoinAgeGates } from "@/lib/opsTestModeShared";
import {
  hasClassMembershipForActor,
  profileExistsForActor,
  resolveInviteApiActor,
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
import { hasMinimumProfile } from "@/lib/profileClient";
import {
  buildOnboardingPath,
  buildProfileEditPath,
} from "@/lib/profileNavigation";
import { buildLoginUrl } from "@/lib/authAccount";
import { isJoinAllowedDeviceId } from "@/lib/deviceIdValidation";
import { ensureSessionMembersLockedIfDue } from "@/lib/sessionJoinLock";
import { recruitmentClosedUserMessage } from "@/lib/callRecruitmentUi";

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

  const actorResult = await resolveInviteApiActor({
    req: input.req,
    deviceId,
  });

  if (!actorResult.ok) {
    const mapped = mapLegacyInviteError(actorResult.error);
    const code = mapped;
    return {
      httpStatus: actorResult.status,
      result: failure(requestId, {
        code,
        message: actorResult.message ?? joinByInviteUserMessage(code),
        classId,
        sessionId: requestedSessionId,
        detail: actorResult.error,
        redirectTo:
          code === "restore_login"
            ? buildLoginUrl(
                buildInviteRoomRedirect({
                  classId,
                  sessionId: requestedSessionId,
                  invite: true,
                })
              )
            : undefined,
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
          allowSecretReregistration: true,
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
              redirectTo:
          code === "restore_login"
            ? buildLoginUrl(
                buildInviteRoomRedirect({
                  classId,
                  sessionId: requestedSessionId,
                  invite: true,
                })
              )
            : undefined,
            }),
          };
        }
        throw error;
      }
    }
  }

  const { data: klass, error: classError } = await sb
    .from("classes")
    .select("id,name,match_deadline_at,lifecycle")
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

  const classLifecycle = String(
    (klass as { lifecycle?: unknown }).lifecycle ?? ""
  )
    .trim()
    .toLowerCase();
  const isOfficialClass = classLifecycle === "official";
  const inviteReturnPath = buildInviteRoomRedirect({
    classId,
    sessionId: requestedSessionId,
    invite: true,
  });

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

  const recruitmentSessionTtlMinutesEarly = await getRecruitmentSessionTtlMinutes();
  await ensureSessionMembersLockedIfDue(requestedSessionId);
  const resolvedEarly = await resolveInviteJoinSession({
    client: sb,
    classId,
    requestedSessionId,
    deviceId,
    matchDeadlineAt: klass.match_deadline_at ?? null,
    recruitmentSessionTtlMinutes: recruitmentSessionTtlMinutesEarly,
  });

  logInviteJoinServer("step", {
    requestId,
    classId,
    requestedSessionId,
    deviceId,
    userId: actor.userId,
    inviteValid: resolvedEarly.ok,
    step: "invite_session_resolve",
    detail: resolvedEarly.ok ? resolvedEarly.reason : resolvedEarly.error,
  });

  if (!resolvedEarly.ok) {
    const code = mapLegacyInviteError(resolvedEarly.error);
    const httpStatus =
      resolvedEarly.error === "session_members_locked" ||
      resolvedEarly.error === "session_closed" ||
      resolvedEarly.error === "recruitment_closed"
        ? 403
        : 400;
    return {
      httpStatus,
      result: failure(requestId, {
        code,
        message: joinByInviteUserMessage(code),
        classId,
        sessionId: requestedSessionId,
        detail: resolvedEarly.error,
      }),
    };
  }

  const profileRow = await (async () => {
    const userId = String(actor.userId ?? "").trim();
    if (userId) {
      const { data } = await sb
        .from("user_profiles")
        .select(
          "display_name,birth_date,gender,declared_age,declared_age_as_of"
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (data) return data;
    }
    const { data } = await sb
      .from("user_profiles")
      .select("display_name,birth_date,gender,declared_age,declared_age_as_of")
      .eq("device_id", deviceId)
      .maybeSingle();
    return data;
  })();

  const hasProfileRow = await profileExistsForActor(sb, actor);
  const hasMinProfile = hasMinimumProfile(profileRow);
  const profileOk = isOfficialClass ? hasProfileRow : hasMinProfile;

  logInviteJoinServer("step", {
    requestId,
    classId,
    deviceId,
    userId: actor.userId,
    hasProfile: profileOk,
    step: "profile_check",
    detail: `lifecycle=${classLifecycle || "unknown"} official=${isOfficialClass ? 1 : 0} min=${hasMinProfile ? 1 : 0}`,
  });

  if (!profileOk) {
    return {
      httpStatus: 409,
      result: failure(requestId, {
        code: "needs_profile",
        message: joinByInviteUserMessage("needs_profile"),
        classId,
        sessionId: requestedSessionId,
        detail: isOfficialClass ? "official_profile" : "minimum_profile",
        redirectTo: isOfficialClass
          ? buildProfileEditPath(inviteReturnPath)
          : buildOnboardingPath(inviteReturnPath),
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
    const opsTest = resolveOpsTestFlags(input.req);
    if (!shouldBypassJoinAgeGates(opsTest)) {
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
    } else {
      logInviteJoinServer("step", {
        requestId,
        classId,
        deviceId,
        userId: actor.userId,
        ageGuardOk: true,
        step: "age_guard",
        detail: "ops_test_ignore_age",
      });
    }

    const slotCheckStarted = Date.now();
    const slotEval = await evaluateClassSlotsLimit(sb, deviceId, {
      joiningClassId: classId,
      userId: actor.userId,
    });
    if (!slotEval.ok) {
      return {
        httpStatus: 500,
        result: failure(requestId, {
          code: "server_error",
          message: joinByInviteUserMessage("server_error"),
          classId,
          sessionId: requestedSessionId,
          detail: slotEval.error,
        }),
      };
    }

    logInviteJoinServer("step", {
      requestId,
      classId,
      deviceId,
      userId: actor.userId,
      classSlotsOk: slotEval.allowed,
      step: "slot_check",
      detail: `count=${slotEval.context.slotCount} limit=${slotEval.context.slotLimit} ms=${Date.now() - slotCheckStarted}`,
    });

    if (!slotEval.allowed) {
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

  const sessionId = resolvedEarly.sessionId;
  const displayName = await resolveDisplayName(sb, actor);

  const { data: existingSessionMember } = await sb
    .from("session_members")
    .select("device_id")
    .eq("session_id", sessionId)
    .eq("device_id", deviceId)
    .maybeSingle();

  const alreadyInSession = Boolean(existingSessionMember);
  if (!alreadyInSession) {
    const lockState = await ensureSessionMembersLockedIfDue(sessionId);
    if (lockState.locked) {
      return {
        httpStatus: 403,
        result: failure(requestId, {
          code: "session_members_locked",
          message: joinByInviteUserMessage("session_members_locked"),
          classId,
          sessionId,
          detail: "session_members_locked",
        }),
      };
    }
  }

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

  let memberCount = resolvedEarly.memberCount;
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
      sessionStatus: String(sessionRow?.status ?? resolvedEarly.sessionStatus ?? null),
      sessionFallback: resolvedEarly.sessionFallback,
      sessionReactivated: resolvedEarly.sessionReactivated,
      sessionFallbackReason: resolvedEarly.reason ?? null,
    }),
  };
}
