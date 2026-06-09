export type EstablishedPeerStaleOfferInput = {
  currentConnectionId: string | null;
  incomingConnectionId: string;
  conn: string;
  ice: string;
  sig: string;
  remoteTrackReceived: boolean;
  answerReceived: boolean;
  remoteTracksCount: number;
  hasRemoteStream: boolean;
  hasPlaybackEvidence: boolean;
};

export function shouldRejectEstablishedPeerStaleOffer(
  input: EstablishedPeerStaleOfferInput
): boolean {
  if (!input.currentConnectionId) return false;
  if (input.currentConnectionId === input.incomingConnectionId) return false;

  const hasEstablishedMedia =
    input.hasPlaybackEvidence ||
    input.remoteTrackReceived ||
    input.answerReceived ||
    (input.remoteTracksCount > 0 && input.hasRemoteStream);

  if (!hasEstablishedMedia) return false;

  const transportUsable =
    input.conn === "connected" ||
    input.conn === "connecting" ||
    input.sig === "stable" ||
    input.ice === "connected" ||
    input.ice === "completed";

  return transportUsable;
}
