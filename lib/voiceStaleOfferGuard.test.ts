import { describe, expect, it } from "vitest";
import {
  isPeerTransportDead,
  shouldRejectEstablishedPeerStaleOffer,
} from "./voiceStaleOfferGuard";

const establishedMedia = {
  remoteTrackReceived: true,
  answerReceived: true,
  remoteTracksCount: 1,
  hasRemoteStream: true,
  hasPlaybackEvidence: true,
};

describe("shouldRejectEstablishedPeerStaleOffer", () => {
  it("rejects stale offer when peer is connected with established media", () => {
    expect(
      shouldRejectEstablishedPeerStaleOffer({
        currentConnectionId: "local__remote__1__abc",
        incomingConnectionId: "local__remote__2__def",
        conn: "connected",
        ice: "connected",
        sig: "stable",
        ...establishedMedia,
      })
    ).toBe(true);
  });

  it("does not reject stale offer when peer transport is failed", () => {
    expect(
      shouldRejectEstablishedPeerStaleOffer({
        currentConnectionId: "local__remote__1__abc",
        incomingConnectionId: "local__remote__2__def",
        conn: "failed",
        ice: "failed",
        sig: "stable",
        ...establishedMedia,
      })
    ).toBe(false);
  });

  it("does not treat sig=stable alone as usable when conn/ice are failed", () => {
    expect(
      shouldRejectEstablishedPeerStaleOffer({
        currentConnectionId: "fd1cc828",
        incomingConnectionId: "__twp1sx",
        conn: "failed",
        ice: "failed",
        sig: "stable",
        remoteTrackReceived: false,
        answerReceived: false,
        remoteTracksCount: 1,
        hasRemoteStream: true,
        hasPlaybackEvidence: false,
      })
    ).toBe(false);
  });

  it("does not reject when connection ids match", () => {
    expect(
      shouldRejectEstablishedPeerStaleOffer({
        currentConnectionId: "same-id",
        incomingConnectionId: "same-id",
        conn: "connected",
        ice: "connected",
        sig: "stable",
        ...establishedMedia,
      })
    ).toBe(false);
  });

  it("does not reject replacement offer when inbound RTP is missing", () => {
    expect(
      shouldRejectEstablishedPeerStaleOffer({
        currentConnectionId: "local__remote__1__abc",
        incomingConnectionId: "local__remote__2__def",
        conn: "connected",
        ice: "connected",
        sig: "stable",
        ...establishedMedia,
        inboundRtpMissing: true,
      })
    ).toBe(false);
  });
});

describe("isPeerTransportDead", () => {
  it("detects failed and closed transport states", () => {
    expect(isPeerTransportDead("failed", "connected")).toBe(true);
    expect(isPeerTransportDead("connected", "failed")).toBe(true);
    expect(isPeerTransportDead("closed", "closed")).toBe(true);
    expect(isPeerTransportDead("connected", "connected")).toBe(false);
  });
});
