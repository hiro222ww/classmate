export type VoiceGlareAction =
  | "rollback_accept_remote_offer"
  | "ignore_remote_offer"
  | "accept_incoming_connection_id";

export type VoiceGlareResolveResult =
  | { action: "rollback_accept_remote_offer" }
  | { action: "ignore_remote_offer"; reason: string }
  | { action: "accept_incoming_connection_id" };

export function isActiveOfferOwner(
  localDeviceId: string,
  remoteDeviceId: string
): boolean {
  return localDeviceId < remoteDeviceId;
}

/** Deterministic join connection id — both peers derive the same value. */
export function makeStableConnectionId(
  deviceA: string,
  deviceB: string
): string {
  const [a, b] =
    deviceA < deviceB ? [deviceA, deviceB] : [deviceB, deviceA];
  return `join__${a}__${b}`;
}

export function resolveOfferConnectionConflict(input: {
  localDeviceId: string;
  remoteDeviceId: string;
  localConnectionId: string | null;
  incomingConnectionId: string;
  sig: string;
  localOfferInFlight: boolean;
  /** When false and local offer is still in flight, accept remote fallback offer. */
  localAnswerReceived?: boolean;
}): VoiceGlareResolveResult | null {
  if (!input.localConnectionId) {
    return { action: "accept_incoming_connection_id" };
  }
  if (input.localConnectionId === input.incomingConnectionId) {
    const localOfferInFlight =
      input.localOfferInFlight || input.sig === "have-local-offer";
    if (!localOfferInFlight) {
      return null;
    }
    if (isActiveOfferOwner(input.localDeviceId, input.remoteDeviceId)) {
      return {
        action: "ignore_remote_offer",
        reason: "active_offer_owner_wins",
      };
    }
    return { action: "rollback_accept_remote_offer" };
  }

  const localOfferInFlight =
    input.localOfferInFlight || input.sig === "have-local-offer";

  if (localOfferInFlight) {
    if (isActiveOfferOwner(input.localDeviceId, input.remoteDeviceId)) {
      return {
        action: "ignore_remote_offer",
        reason: "active_offer_owner_wins",
      };
    }
    return { action: "rollback_accept_remote_offer" };
  }

  return { action: "accept_incoming_connection_id" };
}
