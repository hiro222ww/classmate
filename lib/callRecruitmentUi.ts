/**
 * In-call recruitment status helpers.
 *
 * Soft close: after 3 members, join_open_until ≈ now+30s.
 * Hard close: at capacity (5) or after join window elapses → members_locked_at.
 * Under 3 members: keep recruiting until the 5-minute (+ optional extend) wait ends.
 *
 * Keep this module free of server-only imports (supabaseAdmin, etc.) so call/home
 * client bundles stay browser-safe.
 */

import {
  LOBBY_EXTEND_MS,
  LOBBY_WAIT_TIMEOUT_MS,
} from "@/lib/autoCallOnce";

export const RECRUIT_SOFT_CLOSE_MEMBER_COUNT = 3;
export const RECRUIT_HARD_CLOSE_MEMBER_COUNT = 5;

export type CallRecruitmentPhase =
  | "recruiting"
  | "closing_soon"
  | "closed"
  | "waiting_alone";

export type CallRecruitmentView = {
  phase: CallRecruitmentPhase;
  label: string;
  detail: string | null;
  memberCount: number;
  capacity: number;
  recruitingOpen: boolean;
  /** True when 1–2 members and the first/extended wait window has elapsed. */
  aloneWaitTimedOut: boolean;
  aloneElapsedLabel: string;
  canExtendAloneWait: boolean;
  remainingCloseMs: number | null;
};

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatRemaining(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${sec}秒`;
}

/** Client-safe mirror of isSessionOpenForMatchJoin (no server imports). */
function isRecruitingWindowOpen(params: {
  membersLockedAt: string | null | undefined;
  joinOpenUntil: string | null | undefined;
  nowMs: number;
}): boolean {
  if (params.membersLockedAt) return false;
  if (!params.joinOpenUntil) return true;
  const openUntil = new Date(String(params.joinOpenUntil)).getTime();
  if (!Number.isFinite(openUntil)) return true;
  return params.nowMs < openUntil;
}

export function buildCallRecruitmentView(params: {
  memberCount: number;
  capacity?: number | null;
  membersLockedAt?: string | null;
  joinOpenUntil?: string | null;
  sessionCreatedAt?: string | null;
  lobbyExtendedOnce?: boolean;
  nowMs?: number;
}): CallRecruitmentView {
  const now = params.nowMs ?? Date.now();
  const memberCount = Math.max(0, Math.floor(Number(params.memberCount) || 0));
  const capacityRaw = Number(params.capacity ?? RECRUIT_HARD_CLOSE_MEMBER_COUNT);
  const capacity =
    Number.isFinite(capacityRaw) && capacityRaw > 0
      ? Math.floor(capacityRaw)
      : RECRUIT_HARD_CLOSE_MEMBER_COUNT;

  const recruitingOpen = isRecruitingWindowOpen({
    membersLockedAt: params.membersLockedAt,
    joinOpenUntil: params.joinOpenUntil,
    nowMs: now,
  });

  const createdMs = params.sessionCreatedAt
    ? new Date(params.sessionCreatedAt).getTime()
    : NaN;
  const aloneElapsedMs = Number.isFinite(createdMs)
    ? Math.max(0, now - createdMs)
    : 0;
  const aloneWaitLimitMs = params.lobbyExtendedOnce
    ? LOBBY_WAIT_TIMEOUT_MS + LOBBY_EXTEND_MS
    : LOBBY_WAIT_TIMEOUT_MS;
  const aloneWaitTimedOut =
    memberCount > 0 &&
    memberCount < RECRUIT_SOFT_CLOSE_MEMBER_COUNT &&
    Number.isFinite(createdMs) &&
    aloneElapsedMs >= aloneWaitLimitMs;
  const canExtendAloneWait =
    aloneWaitTimedOut && params.lobbyExtendedOnce !== true;

  const openUntilMs = params.joinOpenUntil
    ? new Date(params.joinOpenUntil).getTime()
    : NaN;
  const remainingCloseMs =
    Number.isFinite(openUntilMs) && openUntilMs > now
      ? openUntilMs - now
      : null;

  if (!recruitingOpen) {
    return {
      phase: "closed",
      label: "募集終了",
      detail: "途中参加の受付は終了しました",
      memberCount,
      capacity,
      recruitingOpen: false,
      aloneWaitTimedOut,
      aloneElapsedLabel: formatElapsed(aloneElapsedMs),
      canExtendAloneWait: false,
      remainingCloseMs: null,
    };
  }

  if (
    memberCount >= RECRUIT_SOFT_CLOSE_MEMBER_COUNT &&
    remainingCloseMs != null
  ) {
    return {
      phase: "closing_soon",
      label: "募集中（まもなく終了）",
      detail: `募集終了まであと ${formatRemaining(remainingCloseMs)}`,
      memberCount,
      capacity,
      recruitingOpen: true,
      aloneWaitTimedOut: false,
      aloneElapsedLabel: formatElapsed(aloneElapsedMs),
      canExtendAloneWait: false,
      remainingCloseMs,
    };
  }

  if (memberCount < RECRUIT_SOFT_CLOSE_MEMBER_COUNT) {
    return {
      phase: "waiting_alone",
      label: "募集中",
      detail: aloneWaitTimedOut
        ? params.lobbyExtendedOnce
          ? "まだ人が集まりません。今回はやめますか？"
          : "5分経っても集まりませんでした。どうしますか？"
        : `待機時間 ${formatElapsed(aloneElapsedMs)} · 友達を招待できます`,
      memberCount,
      capacity,
      recruitingOpen: true,
      aloneWaitTimedOut,
      aloneElapsedLabel: formatElapsed(aloneElapsedMs),
      canExtendAloneWait,
      remainingCloseMs: null,
    };
  }

  return {
    phase: "recruiting",
    label: "募集中",
    detail: `途中参加を受け付けています（${memberCount}/${capacity}）`,
    memberCount,
    capacity,
    recruitingOpen: true,
    aloneWaitTimedOut: false,
    aloneElapsedLabel: formatElapsed(aloneElapsedMs),
    canExtendAloneWait: false,
    remainingCloseMs: null,
  };
}

/** User-facing reason when invite/mid-join is rejected after recruitment ends. */
export function recruitmentClosedUserMessage(detail?: string | null): string {
  const code = String(detail ?? "").trim();
  if (code === "session_members_locked" || code === "members_locked") {
    return "この通話の参加受付は締め切られました。募集終了後は途中参加できません。";
  }
  if (code === "join_window_elapsed" || code === "join_open_until_elapsed") {
    return "募集時間が終了したため、この通話には参加できません。";
  }
  if (
    code === "recruitment_closed" ||
    code === "session_not_joinable" ||
    code === "session_closed" ||
    code === "invite_expired" ||
    code === "expired_invite" ||
    code === "match_deadline_passed"
  ) {
    return "この通話は現在募集していません。募集終了後は途中参加できません。";
  }
  if (code === "invalid_invite") {
    return "招待リンクが無効です。もう一度招待してもらってください。";
  }
  return "この通話は現在募集していません。募集終了後は途中参加できません。";
}
