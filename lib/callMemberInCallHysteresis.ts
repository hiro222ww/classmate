import { debugConsoleLog } from "@/lib/debugVoiceLog";
import { hasLocalLeftCall } from "@/lib/localCallExit";

/** Keep fast-path in-call peers during early presence_sync false negatives. */
export const CALL_MEMBER_IN_CALL_HYSTERESIS_MS = 12_000;

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

export function applyCallMemberInCallHysteresis<T extends CallMemberInCallRow>(
  prev: T[],
  incoming: T[],
  opts: {
    sessionId: string;
    viewerDeviceId: string;
    firstFastMembersAt: number | null;
    localExitedPeers: ReadonlySet<string>;
    fetchReason?: string;
    nowMs?: number;
  }
): T[] {
  const startedAt = opts.firstFastMembersAt;
  if (startedAt == null) return incoming;

  const now = opts.nowMs ?? Date.now();
  if (now - startedAt >= CALL_MEMBER_IN_CALL_HYSTERESIS_MS) {
    return incoming;
  }

  const viewerId = String(opts.viewerDeviceId ?? "").trim();
  const prevById = new Map(
    prev.map((m) => [String(m.device_id ?? "").trim(), m] as const)
  );

  return incoming.map((member) => {
    const did = String(member.device_id ?? "").trim();
    if (!did) return member;

    if (
      opts.localExitedPeers.has(did) ||
      hasLocalLeftCall(opts.sessionId, did)
    ) {
      return member;
    }

    if (viewerId && did === viewerId) {
      return member;
    }

    if (member.is_in_call === true) {
      return member;
    }

    const existing = prevById.get(did);
    if (!existing || existing.is_in_call !== true) {
      return member;
    }

    debugConsoleLog(
      `[session-members] in-call-hysteresis preserve device=${did.slice(-4)} ` +
        `fetchReason=${opts.fetchReason ?? "-"} elapsedMs=${now - startedAt}`
    );

    return {
      ...member,
      is_in_call: true,
    };
  });
}
