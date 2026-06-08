import { debugConsoleLog } from "@/lib/debugVoiceLog";
import { hasLocalLeftCall } from "@/lib/localCallExit";
import { SESSION_MEMBER_PRESERVE_MS } from "@/lib/sessionMemberListMerge";
import {
  isStableVoiceJoinMode,
  STABLE_REMOTE_PEER_GRACE_MS,
} from "@/lib/stableVoiceJoin";

/** Keep fast-path in-call peers during early presence_sync false negatives. */
export const CALL_MEMBER_IN_CALL_HYSTERESIS_MS = isStableVoiceJoinMode()
  ? STABLE_REMOTE_PEER_GRACE_MS
  : 12_000;

/** Per-member grace after last confirmed in-call (presence lag / list drop). */
export const REMOTE_MEMBER_PRESENCE_GRACE_MS = isStableVoiceJoinMode()
  ? STABLE_REMOTE_PEER_GRACE_MS
  : 8_000;

export type CallMemberInCallRow = {
  device_id: string;
  is_in_call?: boolean;
  screen?: string | null;
};

export function shouldStartCallMemberInCallHysteresis(
  firstFastMembersAt: number | null,
  useFast: boolean,
  memberCount: number
): boolean {
  return (
    useFast &&
    memberCount > 0 &&
    firstFastMembersAt == null
  );
}

function shouldPreserveRemoteInCall(
  did: string,
  existing: CallMemberInCallRow | undefined,
  member: CallMemberInCallRow,
  opts: {
    sessionId: string;
    viewerDeviceId: string;
    firstFastMembersAt: number | null;
    localExitedPeers: ReadonlySet<string>;
    memberLastInCallAt: Map<string, number>;
    fetchReason?: string;
    nowMs: number;
  }
): boolean {
  if (
    opts.localExitedPeers.has(did) ||
    hasLocalLeftCall(opts.sessionId, did)
  ) {
    return false;
  }

  const viewerId = String(opts.viewerDeviceId ?? "").trim();
  if (viewerId && did === viewerId) {
    return false;
  }

  if (member.is_in_call === true) {
    return false;
  }

  if (!existing || existing.is_in_call !== true) {
    return false;
  }

  const startedAt = opts.firstFastMembersAt;
  if (startedAt != null && opts.nowMs - startedAt < CALL_MEMBER_IN_CALL_HYSTERESIS_MS) {
    return true;
  }

  const lastAt = opts.memberLastInCallAt.get(did);
  return (
    lastAt != null && opts.nowMs - lastAt < REMOTE_MEMBER_PRESENCE_GRACE_MS
  );
}

export function applyCallMemberInCallHysteresis<T extends CallMemberInCallRow>(
  prev: T[],
  incoming: T[],
  opts: {
    sessionId: string;
    viewerDeviceId: string;
    firstFastMembersAt: number | null;
    localExitedPeers: ReadonlySet<string>;
    memberLastInCallAt: Map<string, number>;
    fetchReason?: string;
    nowMs?: number;
  }
): T[] {
  const now = opts.nowMs ?? Date.now();
  const viewerId = String(opts.viewerDeviceId ?? "").trim();
  const prevById = new Map(
    prev.map((m) => [String(m.device_id ?? "").trim(), m] as const)
  );
  const incomingIds = new Set(
    incoming.map((m) => String(m.device_id ?? "").trim()).filter(Boolean)
  );

  const merged = incoming.map((member) => {
    const did = String(member.device_id ?? "").trim();
    if (!did) return member;

    if (member.is_in_call === true) {
      opts.memberLastInCallAt.set(did, now);
      return member;
    }

    const existing = prevById.get(did);
    if (
      shouldPreserveRemoteInCall(did, existing, member, { ...opts, nowMs: now })
    ) {
      debugConsoleLog(
        `[session-members] in-call-hysteresis preserve device=${did.slice(-4)} ` +
          `fetchReason=${opts.fetchReason ?? "-"}`
      );
      opts.memberLastInCallAt.set(did, opts.memberLastInCallAt.get(did) ?? now);
      return {
        ...member,
        is_in_call: true,
      };
    }

    return member;
  });

  for (const existing of prev) {
    const did = String(existing.device_id ?? "").trim();
    if (!did || incomingIds.has(did)) continue;
    if (viewerId && did === viewerId) continue;
    if (
      opts.localExitedPeers.has(did) ||
      hasLocalLeftCall(opts.sessionId, did)
    ) {
      continue;
    }

    const lastAt = opts.memberLastInCallAt.get(did);
    const withinSessionGrace =
      lastAt != null && now - lastAt < SESSION_MEMBER_PRESERVE_MS;
    const withinInCallGrace =
      lastAt != null && now - lastAt < REMOTE_MEMBER_PRESENCE_GRACE_MS;
    const withinFast =
      opts.firstFastMembersAt != null &&
      now - opts.firstFastMembersAt < CALL_MEMBER_IN_CALL_HYSTERESIS_MS;
    const shouldPreserve =
      withinSessionGrace ||
      withinFast ||
      (existing.is_in_call === true && withinInCallGrace);

    if (shouldPreserve) {
      debugConsoleLog(
        `[session-members] missing-member-grace preserve device=${did.slice(-4)} ` +
          `fetchReason=${opts.fetchReason ?? "-"} inCall=${existing.is_in_call === true ? 1 : 0}`
      );
      merged.push({
        ...existing,
        is_in_call: existing.is_in_call === true ? true : existing.is_in_call,
      });
    }
  }

  return merged;
}
