export type PeerNegotiationPhase =
  | "none"
  | "idle_unnegotiated"
  | "negotiating"
  | "established";

export type PeerNegotiationPhaseInput = {
  pc: RTCPeerConnection | null | undefined;
  isUsablePeer: boolean;
  remoteTrackReceived: boolean;
  hasPlaybackEvidence: boolean;
  audioConfirmedStrict: boolean;
  answerReceived: boolean;
  offerSent: boolean;
  offerReceived: boolean;
  answerSent: boolean;
  offerInFlight: boolean;
  remoteTracksCount: number;
  hasRemoteStream: boolean;
};

export function classifyPeerNegotiationPhase(
  input: PeerNegotiationPhaseInput
): PeerNegotiationPhase {
  if (!input.pc || !input.isUsablePeer) return "none";

  const conn = input.pc.connectionState;
  const sig = input.pc.signalingState;

  if (
    input.remoteTrackReceived ||
    input.hasPlaybackEvidence ||
    input.audioConfirmedStrict ||
    (conn === "connected" &&
      (input.answerReceived ||
        input.remoteTracksCount > 0 ||
        input.hasRemoteStream))
  ) {
    return "established";
  }

  if (
    sig === "have-local-offer" ||
    sig === "have-remote-offer" ||
    input.offerSent ||
    input.offerReceived ||
    input.answerSent ||
    input.offerInFlight
  ) {
    return "negotiating";
  }

  return "idle_unnegotiated";
}

export function shouldSuppressPassiveOfferReschedule(
  phase: PeerNegotiationPhase
): boolean {
  return phase === "established" || phase === "negotiating";
}
