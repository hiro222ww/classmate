export type RemoteJoinPhase =
  | "initial_connect"
  | "awaiting_active_offer"
  | "established";

export function allowsPassiveFallbackOffer(
  phase: RemoteJoinPhase | undefined,
  opts?: { initialJoin?: boolean }
): boolean {
  if (phase === "awaiting_active_offer" || phase === "established") {
    return false;
  }
  if (phase === "initial_connect") return true;
  return opts?.initialJoin === true;
}

export function shouldBlockSoftResetForJoinPhase(
  phase: RemoteJoinPhase | undefined
): boolean {
  return phase === "awaiting_active_offer";
}

/** Passive offer fallback after schedulePassiveWaitOfferTimeout returns false. */
export function shouldSendPassiveOfferAfterWaitScheduleFailed(params: {
  reconnectReason: string;
  joinPhase: RemoteJoinPhase | undefined;
}): boolean {
  if (params.reconnectReason === "auto_hard_reset") return false;
  return allowsPassiveFallbackOffer(params.joinPhase);
}
