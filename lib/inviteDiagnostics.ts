/** Client/server helpers for invite join diagnostics (no credentials). */

export const INVITE_JOIN_GRACE_MS = 18_000;
export const INVITE_MEMBER_EMPTY_STREAK_REQUIRED = 5;

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
  console.log(parts.join(" "));
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

  console.log(
    `${tag} class=${tailId(params.classId)} session=${tailId(params.sessionId)} ` +
      `device=${tailId(params.deviceId)}` +
      (params.deviceReady != null ? ` device-ready=${params.deviceReady}` : "") +
      (params.step ? ` step=${params.step}` : "") +
      (params.error ? ` error=${params.error}` : "")
  );
}

export function logRoomMembersInviteGraceIgnored(params: {
  reason: string;
  graceMsRemaining: number;
  previousCount: number;
  emptyStreak: number;
}) {
  console.log(
    `[room-members] empty-after-invite ignored reason=${params.reason} ` +
      `graceMs=${params.graceMsRemaining} previousCount=${params.previousCount} ` +
      `streak=${params.emptyStreak}`
  );
}
