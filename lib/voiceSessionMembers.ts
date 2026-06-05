import { hasLocalLeftCall } from "@/lib/localCallExit";
import { isStableVoiceJoinMode } from "@/lib/stableVoiceJoin";

export type VoiceMemberRow = {
  device_id: string;
  is_in_call?: boolean;
  screen?: string | null;
};

/** Session member device IDs for voice targeting (excludes self). */
export function getSessionMemberRemoteDeviceIds(
  members: ReadonlyArray<{ device_id?: string | null }>,
  selfDeviceId: string
): string[] {
  const selfId = String(selfDeviceId ?? "").trim();
  return members
    .map((m) => String(m.device_id ?? "").trim())
    .filter((id) => id && id !== selfId);
}

/**
 * Voice connection member list — stable mode ignores presence is_in_call=false.
 * UI display should use raw members; CallVoiceLayer should use this.
 */
export function buildVoiceConnectionMembers<T extends VoiceMemberRow>(
  members: T[],
  opts: {
    sessionId: string;
    explicitLeftIds?: ReadonlySet<string>;
    stable?: boolean;
  }
): T[] {
  const stable = opts.stable ?? isStableVoiceJoinMode();
  if (!stable) return members;

  const sessionId = String(opts.sessionId ?? "").trim();
  const explicit = opts.explicitLeftIds;

  return members.map((member) => {
    const did = String(member.device_id ?? "").trim();
    if (!did) return member;

    const explicitlyLeft =
      explicit?.has(did) === true || hasLocalLeftCall(sessionId, did);

    if (explicitlyLeft) {
      return {
        ...member,
        is_in_call: false,
        screen: member.screen ?? "room",
      };
    }

    return {
      ...member,
      is_in_call: true,
    };
  });
}

/** Stable mode: viewer on /call is always a voice participant unless explicit leave. */
export function isLocalVoiceParticipant(
  member: VoiceMemberRow | null | undefined,
  opts?: { stable?: boolean; explicitLeft?: boolean }
): boolean {
  const stable = opts?.stable ?? isStableVoiceJoinMode();
  if (opts?.explicitLeft === true) return false;
  if (stable) return true;
  return member?.is_in_call !== false;
}

/** Stable mode: session member list is the voice target set. */
export function isRemoteVoiceEligible(
  remoteId: string,
  sessionMemberRemoteIds: ReadonlyArray<string>,
  opts?: { stable?: boolean }
): boolean {
  const id = String(remoteId ?? "").trim();
  if (!id) return false;
  const stable = opts?.stable ?? isStableVoiceJoinMode();
  if (stable) return sessionMemberRemoteIds.includes(id);
  return sessionMemberRemoteIds.includes(id);
}
