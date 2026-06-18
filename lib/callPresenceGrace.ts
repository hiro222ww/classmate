import {
  CALL_JOIN_TRANSITION_GRACE_MS,
  CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
} from "@/lib/callMembersSync";
import { hasLocalLeftCall } from "@/lib/localCallExit";
import {
  isMemberActiveOnCallScreen,
  type VoiceMemberRow,
} from "@/lib/voiceSessionMembers";

export { CALL_JOIN_TRANSITION_GRACE_MS };

/** Member is on /call with is_in_call=true (raw API presence). */
export function isMemberCallActive(
  member: Pick<VoiceMemberRow, "is_in_call" | "screen"> | null | undefined
): boolean {
  if (!member) return false;
  return member.is_in_call === true && isMemberActiveOnCallScreen(member);
}

export type RemoteVoiceRepairSkipReason =
  | "explicit_left"
  | "explicit_removed"
  | "remote_absent_grace_hold"
  | "remote_absent_grace_expired"
  | "join_transition_expired"
  | "session_member_missing_initial";

export function evaluateRemoteVoiceRepairEligibility(params: {
  remoteId: string;
  selfDeviceId: string;
  nowMs: number;
  member?: VoiceMemberRow | null;
  inSessionMembers: boolean;
  absentSinceMs: number | null;
  joinTransitionSinceMs: number | null;
  explicitRemoved: boolean;
  sessionId?: string;
  explicitLeftIds?: ReadonlySet<string>;
}): { eligible: boolean; skipReason?: RemoteVoiceRepairSkipReason } {
  const remoteId = String(params.remoteId ?? "").trim();
  const selfId = String(params.selfDeviceId ?? "").trim();
  if (!remoteId || remoteId === selfId) {
    return { eligible: false, skipReason: "explicit_left" };
  }

  if (params.explicitRemoved) {
    return { eligible: false, skipReason: "explicit_removed" };
  }

  const sessionId = String(params.sessionId ?? "").trim();
  if (sessionId && hasLocalLeftCall(sessionId, remoteId)) {
    return { eligible: false, skipReason: "explicit_left" };
  }
  if (params.explicitLeftIds?.has(remoteId)) {
    return { eligible: false, skipReason: "explicit_left" };
  }

  if (isMemberCallActive(params.member)) {
    return { eligible: true };
  }

  if (params.inSessionMembers) {
    const transitionSince =
      params.joinTransitionSinceMs ?? params.absentSinceMs ?? params.nowMs;
    const elapsed = params.nowMs - transitionSince;
    if (elapsed < CALL_JOIN_TRANSITION_GRACE_MS) {
      return { eligible: true };
    }
    return { eligible: false, skipReason: "join_transition_expired" };
  }

  const absentSince = params.absentSinceMs;
  if (absentSince == null) {
    return { eligible: false, skipReason: "session_member_missing_initial" };
  }

  const absentElapsed = params.nowMs - absentSince;
  if (absentElapsed < CALL_LIVE_MEMBER_ABSENT_GRACE_MS) {
    return { eligible: false, skipReason: "remote_absent_grace_hold" };
  }

  return { eligible: false, skipReason: "remote_absent_grace_expired" };
}

export function isParticipationPriorityExpired(
  priority: string
): boolean {
  return (
    priority === "absent_expired" ||
    priority === "presence_stale_expired" ||
    priority === "explicit_left"
  );
}

export function isParticipationPriorityGrace(
  priority: string
): boolean {
  return priority === "absent_grace" || priority === "presence_stale_grace";
}
