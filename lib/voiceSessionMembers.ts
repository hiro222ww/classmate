import { hasLocalLeftCall } from "@/lib/localCallExit";
import { isStableVoiceJoinMode } from "@/lib/stableVoiceJoin";

export type VoiceMemberRow = {
  device_id: string;
  is_in_call?: boolean;
  screen?: string | null;
};

/** True when member is on the call screen (not room/home/offline). */
export function isMemberActiveOnCallScreen(
  member: Pick<VoiceMemberRow, "screen">
): boolean {
  const screen = String(member.screen ?? "").trim().toLowerCase();
  if (screen === "room" || screen === "home" || screen === "offline") {
    return false;
  }
  return true;
}

/**
 * Remotes actively on the call screen with is_in_call=true (raw API presence).
 * Used for voice repair targeting and strict in-call UI — not session-wide stable override.
 */
export function getCallActiveRemoteDeviceIds(
  members: ReadonlyArray<VoiceMemberRow>,
  selfDeviceId: string,
  opts?: {
    sessionId?: string;
    explicitLeftIds?: ReadonlySet<string>;
  }
): string[] {
  const selfId = String(selfDeviceId ?? "").trim();
  const sessionId = String(opts?.sessionId ?? "").trim();
  const explicit = opts?.explicitLeftIds;

  return members
    .map((m) => String(m.device_id ?? "").trim())
    .filter((id) => {
      if (!id || id === selfId) return false;
      if (explicit?.has(id)) return false;
      if (sessionId && hasLocalLeftCall(sessionId, id)) return false;
      const member = members.find(
        (row) => String(row.device_id ?? "").trim() === id
      );
      if (!member) return false;
      if (member.is_in_call !== true) return false;
      return isMemberActiveOnCallScreen(member);
    });
}

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
 * Voice connection member list for CallVoiceLayer.
 * Stable mode tolerates brief is_in_call=false while still on the call screen
 * (join / presence lag), but never overrides explicit leave or left-call screens.
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
    const screen = String(member.screen ?? "").trim();
    const leftCallScreen =
      screen === "room" || screen === "home" || screen === "offline";

    if (explicitlyLeft || leftCallScreen) {
      return {
        ...member,
        is_in_call: false,
        screen: leftCallScreen ? screen : member.screen ?? "room",
      };
    }

    // Still on call screen: keep voice target during brief presence lag.
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
