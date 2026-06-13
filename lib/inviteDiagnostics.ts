/** Client/server helpers for invite join diagnostics (no credentials). */

import { isDebugLogEnabled, logInfo, logWarn } from "@/lib/debugLog";

export const INVITE_JOIN_GRACE_MS = 18_000;
export const INVITE_MEMBER_EMPTY_STREAK_REQUIRED = 5;
export const INVITE_LINK_EXPIRED_MESSAGE =
  "この招待リンクは期限切れです。もう一度招待してもらってください";

const INVITE_ROUTE_STATE_KEY = "classmate_invite_route_state";

export type StoredInviteRouteState = {
  classId: string;
  sessionId: string;
  invite: boolean;
  storedAt: number;
};

function tailId(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return "-";
  return v.length <= 6 ? v : v.slice(-6);
}

export function storeInviteRouteState(state: StoredInviteRouteState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(INVITE_ROUTE_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function readInviteRouteState(): StoredInviteRouteState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(INVITE_ROUTE_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredInviteRouteState;
    if (!parsed?.classId || !parsed?.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearInviteRouteState() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(INVITE_ROUTE_STATE_KEY);
  } catch {
    // ignore
  }
}

export function logInviteRoute(
  event:
    | "detected"
    | "stored"
    | "navigating"
    | "restored"
    | "mismatch"
    | "join-start"
    | "join-success"
    | "join-failed",
  params: {
    classId?: string;
    sessionId?: string;
    invite?: boolean;
    storedClassId?: string;
    storedSessionId?: string;
    error?: string;
    step?: string;
  }
) {
  const parts = [`[invite-route] ${event}`];
  if (params.invite != null) parts.push(`invite=${params.invite}`);
  if (params.classId) parts.push(`class=${tailId(params.classId)}`);
  if (params.sessionId) parts.push(`session=${tailId(params.sessionId)}`);
  if (params.storedClassId) parts.push(`storedClass=${tailId(params.storedClassId)}`);
  if (params.storedSessionId) {
    parts.push(`storedSession=${tailId(params.storedSessionId)}`);
  }
  if (params.step) parts.push(`step=${params.step}`);
  if (params.error) parts.push(`error=${params.error}`);
  const line = parts.join(" ");
  if (
    event === "join-failed" ||
    event === "mismatch" ||
    params.error
  ) {
    logWarn(line);
    return;
  }
  if (isDebugLogEnabled()) {
    logInfo(line);
  }
}

export function isInviteJoinGraceActive(untilMs: number) {
  return untilMs > 0 && Date.now() < untilMs;
}

export function logInviteJoinClient(
  event: "start" | "step" | "success" | "failed",
  params: {
    classId: string;
    sessionId: string;
    deviceId: string;
    step?: string;
    error?: string;
    deviceReady?: boolean;
  }
) {
  const tag =
    event === "start"
      ? "[invite-join] start"
      : event === "success"
        ? "[invite-join] success"
        : event === "failed"
          ? "[invite-join] failed"
          : "[invite-join] step";

  const line =
    `${tag} class=${tailId(params.classId)} session=${tailId(params.sessionId)} ` +
    `device=${tailId(params.deviceId)}` +
    (params.deviceReady != null ? ` device-ready=${params.deviceReady}` : "") +
    (params.step ? ` step=${params.step}` : "") +
    (params.error ? ` error=${params.error}` : "");

  if (event === "failed" || params.error) {
    logWarn(line);
    return;
  }
  if (event === "success") {
    logInfo(line);
    return;
  }
  if (isDebugLogEnabled()) {
    logInfo(line);
  }
}

export function logRoomMembersInviteGraceIgnored(params: {
  reason: string;
  graceMsRemaining: number;
  previousCount: number;
  emptyStreak: number;
}) {
  if (!isDebugLogEnabled()) return;
  logInfo(
    `[room-members] empty-after-invite ignored reason=${params.reason} ` +
      `graceMs=${params.graceMsRemaining} previousCount=${params.previousCount} ` +
      `streak=${params.emptyStreak}`
  );
}

export function isInviteJoinFailureMessage(message: string): boolean {
  const value = String(message ?? "").trim();
  return (
    value.includes("招待されたクラス") ||
    value === "参加に失敗しました" ||
    value.includes("参加できるクラス数") ||
    value === INVITE_LINK_EXPIRED_MESSAGE
  );
}

export function formatInviteJoinApiError(errorCode: string): string {
  const code = String(errorCode ?? "").trim();
  if (code === "class_slots_limit") {
    return "参加できるクラス数の上限に達しています";
  }
  if (
    code === "invite_expired" ||
    code === "session_closed" ||
    code === "session_not_joinable" ||
    code === "recruitment_closed" ||
    code === "match_deadline_passed"
  ) {
    return INVITE_LINK_EXPIRED_MESSAGE;
  }
  return "招待されたクラスへの参加に失敗しました";
}

export type InviteJoinApiTrace = {
  inviteJoinOk: boolean | null;
  inviteJoinStatus: number | null;
  inviteJoinError: string;
  sessionJoinOk: boolean | null;
  sessionJoinStatus: number | null;
  sessionJoinError: string;
  membershipExists: boolean;
  sessionMemberExists: boolean;
};

export function createEmptyInviteJoinApiTrace(): InviteJoinApiTrace {
  return {
    inviteJoinOk: null,
    inviteJoinStatus: null,
    inviteJoinError: "",
    sessionJoinOk: null,
    sessionJoinStatus: null,
    sessionJoinError: "",
    membershipExists: false,
    sessionMemberExists: false,
  };
}

export function logInviteErrorUi(params: {
  reason: string;
  classId?: string;
  urlSessionId?: string;
  joinedSessionId?: string;
  currentSessionId?: string;
  deviceId?: string;
  openJoinedClass?: boolean;
  invite?: boolean;
  inviteOk?: boolean | null;
  inviteStatus?: number | null;
  inviteError?: string;
  sessionJoinOk?: boolean | null;
  sessionJoinStatus?: number | null;
  sessionJoinError?: string;
  membershipExists?: boolean;
  sessionMemberExists?: boolean;
  roomReady?: boolean;
  displayMembers?: number;
  err?: string;
  joinOpGen?: number;
  currentOpGen?: number;
  suppressed?: boolean;
}) {
  const action = params.suppressed ? "suppress" : "show";
  const parts = [
    `[invite-error-ui] ${action} reason=${params.reason}`,
    `class=${tailId(params.classId ?? "")}`,
    `urlSession=${tailId(params.urlSessionId ?? "")}`,
    `joinedSession=${tailId(params.joinedSessionId ?? "")}`,
    `currentSession=${tailId(params.currentSessionId ?? "")}`,
    `device=${tailId(params.deviceId ?? "")}`,
    `openJoinedClass=${params.openJoinedClass ? 1 : 0}`,
    `invite=${params.invite ? 1 : 0}`,
    `inviteOk=${params.inviteOk == null ? "-" : params.inviteOk ? 1 : 0}`,
    `inviteStatus=${params.inviteStatus ?? "-"}`,
    `sessionJoinOk=${params.sessionJoinOk == null ? "-" : params.sessionJoinOk ? 1 : 0}`,
    `sessionJoinStatus=${params.sessionJoinStatus ?? "-"}`,
    `membershipExists=${params.membershipExists ? 1 : 0}`,
    `sessionMemberExists=${params.sessionMemberExists ? 1 : 0}`,
    `roomReady=${params.roomReady ? 1 : 0}`,
    `displayMembers=${params.displayMembers ?? "-"}`,
    `joinOpGen=${params.joinOpGen ?? "-"}`,
    `currentOpGen=${params.currentOpGen ?? "-"}`,
  ];
  if (params.inviteError) parts.push(`inviteApiError=${params.inviteError}`);
  if (params.sessionJoinError) parts.push(`sessionJoinError=${params.sessionJoinError}`);
  if (params.err) parts.push(`err=${params.err}`);
  logWarn(parts.join(" "));
}
