import { isValidUuid } from "@/lib/userIdentity";
import { isJoinAllowedDeviceId } from "@/lib/deviceIdValidation";

export const CLASS_VOTE_THRESHOLD = 3;

export type PromoteRpcResult = {
  ok: boolean;
  reason?: string;
  promoted?: boolean;
  vote_count?: number;
  class_id?: string;
  class_name?: string;
  lifecycle?: string;
};

export type ClassVoteStatusView = {
  voteCount: number;
  selfVoted: boolean;
  promoted: boolean;
  classId: string | null;
  className: string | null;
  lifecycle: string | null;
  membersLocked: boolean;
  canShowVoteUi: boolean;
};

export function normalizeSessionId(value: unknown): string {
  const s = String(value ?? "").trim();
  return isValidUuid(s) ? s : "";
}

export function normalizeClassVoteDeviceId(value: unknown): string {
  const s = String(value ?? "").trim();
  return isJoinAllowedDeviceId(s) ? s : "";
}

export function normalizeOptionalClassId(value: unknown): string {
  const s = String(value ?? "").trim();
  return isValidUuid(s) ? s : "";
}

/** True when vote count meets the promote threshold. */
export function hasEnoughClassVotes(
  voteCount: number,
  threshold = CLASS_VOTE_THRESHOLD
): boolean {
  return Number(voteCount) >= threshold;
}

/**
 * Parse jsonb returned by promote_provisional_class_from_session.
 */
export function parsePromoteRpcResult(raw: unknown): PromoteRpcResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "invalid_rpc_result" };
  }
  const row = raw as Record<string, unknown>;
  return {
    ok: row.ok === true,
    reason: row.reason != null ? String(row.reason) : undefined,
    promoted: row.promoted === true || row.ok === true,
    vote_count:
      row.vote_count != null && Number.isFinite(Number(row.vote_count))
        ? Number(row.vote_count)
        : undefined,
    class_id: row.class_id != null ? String(row.class_id) : undefined,
    class_name: row.class_name != null ? String(row.class_name) : undefined,
    lifecycle: row.lifecycle != null ? String(row.lifecycle) : undefined,
  };
}

/**
 * Decide whether the in-call "make a class" UI should appear.
 * Requires members locked (or already promoted) and at least 3 members in call.
 */
export function shouldShowClassVoteUi(params: {
  memberCount: number;
  membersLocked: boolean;
  lifecycle: string | null | undefined;
  promoted: boolean;
}): boolean {
  const lifecycle = String(params.lifecycle ?? "")
    .trim()
    .toLowerCase();
  if (params.promoted) return true;
  if (lifecycle !== "provisional") return false;
  if (params.memberCount < CLASS_VOTE_THRESHOLD) return false;
  return params.membersLocked;
}

export function buildClassVoteStatusView(params: {
  voteCount: number;
  selfVoted: boolean;
  promoted: boolean;
  classId: string | null;
  className: string | null;
  lifecycle: string | null;
  membersLocked: boolean;
  memberCount: number;
}): ClassVoteStatusView {
  return {
    voteCount: Math.max(0, Math.floor(Number(params.voteCount) || 0)),
    selfVoted: params.selfVoted === true,
    promoted: params.promoted === true,
    classId: params.classId,
    className: params.className,
    lifecycle: params.lifecycle,
    membersLocked: params.membersLocked === true,
    canShowVoteUi: shouldShowClassVoteUi({
      memberCount: params.memberCount,
      membersLocked: params.membersLocked,
      lifecycle: params.lifecycle,
      promoted: params.promoted,
    }),
  };
}
