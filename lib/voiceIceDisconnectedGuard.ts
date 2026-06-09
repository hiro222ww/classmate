/** Grace before acting on transient ICE disconnected (not immediate reconnect). */
export const ICE_DISCONNECTED_RECONNECT_GRACE_MS = 8_000;

export type IceDisconnectedGuardInput = {
  hasPlaybackEvidence: boolean;
  audioConfirmedStrict: boolean;
  trackLive: boolean;
  inboundDeltaBytes: number;
  outboundDeltaBytes: number;
  conn: string;
  ice: string;
};

export type IceDisconnectedSuppressReason =
  | "playback_evidence"
  | "audio_confirmed_strict"
  | "rtp_still_flowing"
  | "remote_track_live";

export function evaluateIceDisconnectedReconnectSuppressReason(
  input: IceDisconnectedGuardInput
): IceDisconnectedSuppressReason | null {
  if (input.audioConfirmedStrict) return "audio_confirmed_strict";
  if (input.hasPlaybackEvidence) return "playback_evidence";
  if (input.trackLive && input.inboundDeltaBytes > 0) {
    return "remote_track_live";
  }
  if (input.inboundDeltaBytes > 0 && input.outboundDeltaBytes > 0) {
    return "rtp_still_flowing";
  }
  return null;
}

export function isIceTransportReconnectReason(reason: string): boolean {
  const value = String(reason ?? "").trim();
  return (
    value === "ice_disconnected" ||
    value === "ice_failed" ||
    value === "heal_pc_failed_or_closed" ||
    value === "heal_stream_without_connected_pc" ||
    value === "heal_live_stream_not_connected_timeout"
  );
}

export function isPeerIceDisconnectedOnly(input: {
  conn: string;
  ice: string;
}): boolean {
  if (input.ice !== "disconnected") return false;
  return input.conn !== "failed" && input.conn !== "closed";
}
