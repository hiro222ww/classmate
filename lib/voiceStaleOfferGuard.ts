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
  /** When true, receiver has no inbound RTP despite a remote track — accept replacement offers. */
  inboundRtpMissing?: boolean;
};

export function isPeerTransportDead(conn: string, ice: string): boolean {
  return (
    conn === "failed" ||
    conn === "closed" ||
    ice === "failed" ||
    ice === "closed"
  );
}

export function isPeerTransportUsableForStaleOffer(
  conn: string,
  ice: string
): boolean {
  if (isPeerTransportDead(conn, ice)) return false;

  const pcHealthyOrConnecting =
    conn === "connected" || conn === "connecting";

  const iceUsable = ice !== "failed" && ice !== "closed";

  return pcHealthyOrConnecting && iceUsable;
}

export function shouldRejectEstablishedPeerStaleOffer(
  input: EstablishedPeerStaleOfferInput
): boolean {
  if (!input.currentConnectionId) return false;
  if (input.currentConnectionId === input.incomingConnectionId) return false;

  if (isPeerTransportDead(input.conn, input.ice)) return false;

  const hasEstablishedMedia =
    input.hasPlaybackEvidence ||
    input.remoteTrackReceived ||
    input.answerReceived ||
    (input.remoteTracksCount > 0 && input.hasRemoteStream);

  if (!hasEstablishedMedia) return false;

  if (input.inboundRtpMissing) return false;

  return isPeerTransportUsableForStaleOffer(input.conn, input.ice);
}
