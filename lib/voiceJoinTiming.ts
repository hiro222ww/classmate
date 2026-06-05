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
