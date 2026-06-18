import { isDebugLogEnabled, logDebug } from "@/lib/debugLog";
import { CALL_LIVE_MEMBER_ABSENT_GRACE_MS } from "@/lib/callMembersSync";
import { isPresenceFresh } from "@/lib/memberPresenceStatus";
import { getPresenceFreshMsForContext } from "@/lib/sessionMemberListMerge";

/** Brief label before removing departed remote from the call grid. */
export const CALL_DEPARTED_LABEL_MS = 5_000;

/** Grace while presence is stale or is_in_call=false before treating as offline. */
export const CALL_PRESENCE_STALE_GRACE_MS = CALL_LIVE_MEMBER_ABSENT_GRACE_MS;

export type CallParticipationPriority =
  | "explicit_left"
  | "absent_expired"
  | "absent_grace"
  | "presence_stale_expired"
  | "presence_stale_grace"
  | "in_call";

export type CallStatusPriorityChoice =
  | "removed"
  | "offline"
  | "reconnecting"
  | "connecting"
  | "unstable"
  | "connected";

export function evaluateCallParticipationPriority(params: {
  nowMs: number;
  explicitLeft: boolean;
  inApiSessionMembers: boolean;
  absentSinceMs: number | null;
  isInCall: boolean;
  lastSeenAt?: string | null;
  lastInCallAtMs?: number | null;
  screen?: string | null;
}): {
  priority: CallParticipationPriority;
  reason: string;
  peerStillInCall: boolean;
} {
  if (params.explicitLeft) {
    return {
      priority: "explicit_left",
      reason: "explicit_left",
      peerStillInCall: false,
    };
  }

  if (!params.inApiSessionMembers) {
    const since = params.absentSinceMs;
    if (since == null) {
      return {
        priority: "absent_grace",
        reason: "session_member_missing_initial",
        peerStillInCall: false,
      };
    }
    if (params.nowMs - since >= CALL_LIVE_MEMBER_ABSENT_GRACE_MS) {
      return {
        priority: "absent_expired",
        reason: "absent_grace_expired",
        peerStillInCall: false,
      };
    }
    return {
      priority: "absent_grace",
      reason: "session_member_missing_grace",
      peerStillInCall: false,
    };
  }

  const freshMs = getPresenceFreshMsForContext("call");
  const presenceFresh = isPresenceFresh(params.lastSeenAt, freshMs);
  const screen = String(params.screen ?? "").trim();
  const participationDown =
    params.isInCall !== true ||
    screen === "room" ||
    screen === "home" ||
    screen === "offline";

  if (!presenceFresh || participationDown) {
    const lastSeenMs = parseTimestampMs(params.lastSeenAt);
    if (
      !presenceFresh &&
      lastSeenMs != null &&
      params.nowMs - lastSeenMs >= CALL_PRESENCE_STALE_GRACE_MS
    ) {
      return {
        priority: "presence_stale_expired",
        reason: "presence_stale_expired",
        peerStillInCall: false,
      };
    }

    const anchor = params.lastInCallAtMs ?? params.nowMs;
    if (params.nowMs - anchor >= CALL_PRESENCE_STALE_GRACE_MS) {
      return {
        priority: "presence_stale_expired",
        reason: participationDown ? "in_call_false_expired" : "presence_stale_expired",
        peerStillInCall: false,
      };
    }

    return {
      priority: "presence_stale_grace",
      reason: participationDown ? "in_call_false_grace" : "presence_stale_grace",
      peerStillInCall: false,
    };
  }

  return {
    priority: "in_call",
    reason: "active",
    peerStillInCall: true,
  };
}

function parseTimestampMs(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function mapParticipationToStatusChoice(
  priority: CallParticipationPriority
): CallStatusPriorityChoice | null {
  switch (priority) {
    case "explicit_left":
    case "absent_expired":
    case "presence_stale_expired":
      return "removed";
    case "absent_grace":
    case "presence_stale_grace":
      return "offline";
    default:
      return null;
  }
}

export function resolveParticipationPriorityStatus(priority: CallParticipationPriority): {
  text: string;
  color: string;
  chipBg: string;
  chipText: string;
  reason: string;
  source: string;
} | null {
  switch (priority) {
    case "explicit_left":
    case "absent_expired":
    case "presence_stale_expired":
      return {
        text: "退出済み",
        color: "#6b7280",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
        reason: priority,
        source: "participation",
      };
    case "absent_grace":
    case "presence_stale_grace":
      return {
        text: "不在",
        color: "#6b7280",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
        reason: priority,
        source: "participation",
      };
    default:
      return null;
  }
}

export function shouldShowVoiceUnstableStatus(params: {
  peerStillInCall: boolean;
  participationPriority: CallParticipationPriority;
}): boolean {
  return params.peerStillInCall && params.participationPriority === "in_call";
}

export function shouldHideDepartedMemberFromGrid(params: {
  priority: CallParticipationPriority;
  recentlyDepartedUntilMs: number | null;
  nowMs: number;
}): boolean {
  if (
    params.priority !== "explicit_left" &&
    params.priority !== "absent_expired" &&
    params.priority !== "presence_stale_expired"
  ) {
    return false;
  }
  if (
    params.recentlyDepartedUntilMs != null &&
    params.nowMs <= params.recentlyDepartedUntilMs
  ) {
    return false;
  }
  return true;
}

export function logCallStatusPriority(params: {
  remoteId: string;
  chosen: CallStatusPriorityChoice;
  reason: string;
  participationPriority: CallParticipationPriority;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "call",
    `[call-status-priority] remote=${params.remoteId.slice(-4)} ` +
      `chosen=${params.chosen} reason=${params.reason} ` +
      `participation=${params.participationPriority}`
  );
}

export function resolveFinalStatusChoice(params: {
  participationPriority: CallParticipationPriority;
  statusText: string;
  statusReason: string;
}): CallStatusPriorityChoice {
  const participationChoice = mapParticipationToStatusChoice(
    params.participationPriority
  );
  if (participationChoice) return participationChoice;
  if (params.statusText === "通話中" || params.statusText === "音声受信中") {
    return "connected";
  }
  if (
    params.statusText.includes("不安定") ||
    params.statusReason.includes("unstable") ||
    params.statusReason.includes("auto_hard_reset_give_up")
  ) {
    return "unstable";
  }
  if (params.statusText === "退出済み" || params.statusText === "退出しました") {
    return "removed";
  }
  if (
    params.statusText === "再接続中" ||
    params.statusText === "再接続を試みています"
  ) {
    return "reconnecting";
  }
  return "connecting";
}
