/**
 * Stability-first voice join: prefer reliable connection over fast path / presence sync.
 * Set to false only when re-enabling join speed experiments.
 */
export const STABLE_VOICE_JOIN_MODE = true;

/** Grace while remote is false/missing from presence but still a session member candidate. */
export const STABLE_REMOTE_PEER_GRACE_MS = 30_000;

/** Delay before first non-fast presence_sync on /call. */
export const STABLE_PRESENCE_SYNC_MAX_DELAY_MS = 10_000;

/** Require mic ready + at least this long before presence_sync (stable mode). */
export const STABLE_PRESENCE_SYNC_MIN_AFTER_MIC_MS = 8_000;

export function isStableVoiceJoinMode(): boolean {
  return STABLE_VOICE_JOIN_MODE;
}

export function shouldUseFastSessionStatus(opts?: { fast?: boolean }): boolean {
  if (isStableVoiceJoinMode()) return false;
  return opts?.fast === true;
}

export function getRemotePeerMemberGraceMs(): number {
  return isStableVoiceJoinMode()
    ? STABLE_REMOTE_PEER_GRACE_MS
    : 8_000;
}

export function preferTurnForInitialJoin(): boolean {
  return isStableVoiceJoinMode();
}

/** Reasons that require explicit leave evidence before close in stable mode. */
export const STABLE_CLOSE_REQUIRES_EVIDENCE = new Set([
  "member_removed",
  "member_left",
  "presence_confirmed_leave",
  "offer_effect_member_removed",
  "heal_member_left",
]);

export function stableCloseRequiresEvidence(reason: string): boolean {
  if (!isStableVoiceJoinMode()) return false;
  return STABLE_CLOSE_REQUIRES_EVIDENCE.has(reason);
}

export function isExplicitPeerCloseReason(reason: string): boolean {
  return (
    reason === "leave_signal" ||
    reason === "explicit_remote_leave" ||
    reason === "explicit_local_leave" ||
    reason === "session_changed" ||
    reason === "device_changed" ||
    reason === "component_unmount"
  );
}
