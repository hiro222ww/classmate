import { preferTurnForInitialJoin } from "@/lib/stableVoiceJoin";

/** When true, new calls bias toward earlier static TURN (relay) for multi-peer sessions. */
export const PREFER_TURN_FOR_INITIAL_BETA = false;

function useEarlyTurnBias(): boolean {
  return PREFER_TURN_FOR_INITIAL_BETA || preferTurnForInitialJoin();
}

export function getP2pCheckingGraceMs(memberCount: number): number {
  const count = Math.max(1, memberCount);
  if (useEarlyTurnBias() || count >= 3) return 2500;
  if (count <= 2) return 4000;
  return 3000;
}

export function getConnectingTurnProbeMs(memberCount: number): number {
  const count = Math.max(1, memberCount);
  if (useEarlyTurnBias() || count >= 3) return 2000;
  return 4000;
}

export function getConnectedAudioConfirmTimeoutMs(memberCount: number): number {
  const count = Math.max(1, memberCount);
  if (useEarlyTurnBias() || count >= 3) return 7000;
  return 11000;
}

/** Extra wait after remote track + transport are up but strict confirm is still pending. */
export const CONNECTED_AUDIO_CONFIRM_PLAYBACK_GRACE_MS = 12_000;

/** Defer aggressive heal / passive force-offer right after Call voice join. */
export const VOICE_JOIN_STABILIZATION_MS = 2000;

/** Wait for answer/ICE before treating have-local-offer as stuck. */
export const HAVE_LOCAL_OFFER_STUCK_MS = 12_000;

/** Passive/active deadlock probe before force-offer (after stabilization). */
export const NO_STREAM_NO_OFFER_FORCE_MS = 9000;

/** Passive waits for active offer on initial join before one-shot fallback. */
export const PASSIVE_WAIT_OFFER_INITIAL_MS = 5000;
