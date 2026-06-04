import { debugConsoleLog, debugConsoleInfo } from "@/lib/debugVoiceLog";
/** Guards + logs for session member list UI updates (room/call). */

import {
  INVITE_JOIN_GRACE_MS,
  INVITE_MEMBER_EMPTY_STREAK_REQUIRED,
} from "@/lib/inviteDiagnostics";

export const MEMBER_LIST_EMPTY_STREAK_REQUIRED = 2;

export function compactMemberDeviceIds(
  members: Array<{ device_id?: string | null }>
): string {
  return members
    .map((m) => String(m.device_id ?? "").trim().slice(-4))
    .filter(Boolean)
    .join(",");
}

export function diffMemberDeviceIds(
  prev: Array<{ device_id?: string | null }>,
  next: Array<{ device_id?: string | null }>
) {
  const prevSet = new Set(
    prev.map((m) => String(m.device_id ?? "").trim()).filter(Boolean)
  );
  const nextSet = new Set(
    next.map((m) => String(m.device_id ?? "").trim()).filter(Boolean)
  );

  const removed: string[] = [];
  const added: string[] = [];

  for (const id of prevSet) {
    if (!nextSet.has(id)) removed.push(id.slice(-4));
  }
  for (const id of nextSet) {
    if (!prevSet.has(id)) added.push(id.slice(-4));
  }

  return { removed, added };
}

export type MemberListApplyDecision = {
  apply: boolean;
  nextEmptyStreak: number;
  ignoreReason?: string;
  shouldRedirectRemoved: boolean;
  viewerInNext: boolean;
};

export function evaluateMemberListApply(params: {
  fetchOk: boolean;
  reason: string;
  prevMembers: Array<{ device_id?: string | null }>;
  nextMembers: Array<{ device_id?: string | null }>;
  viewerDeviceId: string;
  emptyStreak: number;
  requiredEmptyStreak?: number;
  inviteGraceActive?: boolean;
  hasClassMembershipHint?: boolean;
  /** DB session_members に viewer がいる（status API）。false なら一覧からの削除を確定扱いにできる */
  viewerInSessionMembers?: boolean;
  /** 明示退室操作後のみ true にする */
  explicitLeave?: boolean;
}): MemberListApplyDecision {
  const required = params.inviteGraceActive
    ? (params.requiredEmptyStreak ?? INVITE_MEMBER_EMPTY_STREAK_REQUIRED)
    : (params.requiredEmptyStreak ?? MEMBER_LIST_EMPTY_STREAK_REQUIRED);
  const viewerId = String(params.viewerDeviceId ?? "").trim();
  const prevCount = params.prevMembers.length;
  const nextCount = params.nextMembers.length;
  const viewerInNext = params.nextMembers.some(
    (m) => String(m.device_id ?? "").trim() === viewerId
  );

  if (!params.fetchOk) {
    return {
      apply: false,
      nextEmptyStreak: params.emptyStreak,
      ignoreReason: "fetch_not_ok",
      shouldRedirectRemoved: false,
      viewerInNext: false,
    };
  }

  if (!viewerId) {
    return {
      apply: true,
      nextEmptyStreak: 0,
      shouldRedirectRemoved: false,
      viewerInNext,
    };
  }

  if (viewerInNext) {
    return {
      apply: true,
      nextEmptyStreak: 0,
      shouldRedirectRemoved: false,
      viewerInNext: true,
    };
  }

  if (params.explicitLeave === true) {
    return {
      apply: true,
      nextEmptyStreak: 0,
      shouldRedirectRemoved: true,
      viewerInNext: false,
    };
  }

  if (params.viewerInSessionMembers === true) {
    return {
      apply: false,
      nextEmptyStreak: params.emptyStreak,
      ignoreReason: "viewer_still_in_session_members",
      shouldRedirectRemoved: false,
      viewerInNext: false,
    };
  }

  const inviteGrace = params.inviteGraceActive === true;
  const sessionMemberRemovalConfirmed =
    params.viewerInSessionMembers === false;

  // Viewer missing from API result
  if (nextCount === 0 && prevCount > 0) {
    const nextStreak = params.emptyStreak + 1;
    if (nextStreak < required || inviteGrace) {
      return {
        apply: false,
        nextEmptyStreak: nextStreak,
        ignoreReason: inviteGrace ? "invite_grace" : "temporary_empty_response",
        shouldRedirectRemoved: false,
        viewerInNext: false,
      };
    }
    return {
      apply: true,
      nextEmptyStreak: nextStreak,
      shouldRedirectRemoved:
        sessionMemberRemovalConfirmed && !params.hasClassMembershipHint,
      viewerInNext: false,
    };
  }

  // Others listed but viewer gone — require session_members removal confirmation
  if (nextCount > 0) {
    if (inviteGrace || params.hasClassMembershipHint) {
      const nextStreak = params.emptyStreak + 1;
      if (nextStreak < required) {
        return {
          apply: false,
          nextEmptyStreak: nextStreak,
          ignoreReason: inviteGrace ? "invite_grace" : "viewer_missing_retry",
          shouldRedirectRemoved: false,
          viewerInNext: false,
        };
      }
    }
    return {
      apply: true,
      nextEmptyStreak: 0,
      shouldRedirectRemoved: !(inviteGrace || params.hasClassMembershipHint),
      viewerInNext: false,
    };
  }

  // empty → empty, viewer still missing
  const nextStreak = params.emptyStreak + 1;
  const confirmedEmpty = nextStreak >= required && !inviteGrace;
  return {
    apply: confirmedEmpty,
    nextEmptyStreak: nextStreak,
    ignoreReason:
      inviteGrace || nextStreak < required ? "invite_grace" : undefined,
    shouldRedirectRemoved:
      confirmedEmpty &&
      sessionMemberRemovalConfirmed &&
      !params.hasClassMembershipHint,
    viewerInNext: false,
  };
}

export function getInviteGraceRemainingMs(untilMs: number) {
  if (untilMs <= 0) return 0;
  return Math.max(0, untilMs - Date.now());
}

export { INVITE_JOIN_GRACE_MS };

export function logRoomMembersBeforeUpdate(params: {
  context: "room" | "call";
  reason: string;
  sessionId: string;
  classId: string;
  currentCount: number;
  nextCount: number;
  currentIds: string;
  nextIds: string;
  apply: boolean;
  ignoreReason?: string;
  removed?: string[];
  added?: string[];
}) {
  const suffix =
    params.removed?.length || params.added?.length
      ? ` removed=${params.removed?.join(",") ?? ""} added=${params.added?.join(",") ?? ""}`
      : "";

  debugConsoleLog(
    `[room-members] before-update context=${params.context} reason=${params.reason} ` +
      `session=${params.sessionId.slice(-6)} class=${params.classId.slice(-6)} ` +
      `currentCount=${params.currentCount} nextCount=${params.nextCount} apply=${params.apply}` +
      (params.ignoreReason ? ` ignore=${params.ignoreReason}` : "") +
      ` currentIds=${params.currentIds || "-"} nextIds=${params.nextIds || "-"}${suffix}`
  );
}

export function logRoomMembersEmptyIgnored(params: {
  context: "room" | "call";
  reason: string;
  emptyStreak: number;
  required: number;
}) {
  debugConsoleLog(
    `[room-members] empty-result ignored context=${params.context} reason=${params.reason} ` +
      `streak=${params.emptyStreak}/${params.required}`
  );
}

export function logRoomMembersRemoved(params: {
  context: "room" | "call";
  deviceTail: string;
  reason: string;
}) {
  debugConsoleLog(
    `[room-members] member-removed context=${params.context} device=${params.deviceTail} ` +
      `reason=${params.reason}`
  );
}
