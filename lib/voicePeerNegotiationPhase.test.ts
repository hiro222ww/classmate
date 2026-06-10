import { describe, expect, it } from "vitest";
import {
  classifyPeerNegotiationPhase,
  shouldSuppressPassiveOfferReschedule,
} from "./voicePeerNegotiationPhase";

describe("voicePeerNegotiationPhase", () => {
  it("classifies idle PC with no negotiation marks", () => {
    expect(
      classifyPeerNegotiationPhase({
        pc: { connectionState: "new", signalingState: "stable" } as RTCPeerConnection,
        isUsablePeer: true,
        remoteTrackReceived: false,
        hasPlaybackEvidence: false,
        audioConfirmedStrict: false,
        answerReceived: false,
        offerSent: false,
        offerReceived: false,
        answerSent: false,
        offerInFlight: false,
        remoteTracksCount: 0,
        hasRemoteStream: false,
      })
    ).toBe("idle_unnegotiated");
  });

  it("classifies negotiating when local offer is in flight", () => {
    expect(
      classifyPeerNegotiationPhase({
        pc: {
          connectionState: "connecting",
          signalingState: "have-local-offer",
        } as RTCPeerConnection,
        isUsablePeer: true,
        remoteTrackReceived: false,
        hasPlaybackEvidence: false,
        audioConfirmedStrict: false,
        answerReceived: false,
        offerSent: true,
        offerReceived: false,
        answerSent: false,
        offerInFlight: true,
        remoteTracksCount: 0,
        hasRemoteStream: false,
      })
    ).toBe("negotiating");
  });

  it("classifies established when remote track was received", () => {
    expect(
      classifyPeerNegotiationPhase({
        pc: {
          connectionState: "connected",
          signalingState: "stable",
        } as RTCPeerConnection,
        isUsablePeer: true,
        remoteTrackReceived: true,
        hasPlaybackEvidence: false,
        audioConfirmedStrict: false,
        answerReceived: true,
        offerSent: true,
        offerReceived: true,
        answerSent: true,
        offerInFlight: false,
        remoteTracksCount: 1,
        hasRemoteStream: true,
      })
    ).toBe("established");
  });

  it("suppresses passive reschedule only for established or negotiating", () => {
    expect(shouldSuppressPassiveOfferReschedule("idle_unnegotiated")).toBe(false);
    expect(shouldSuppressPassiveOfferReschedule("negotiating")).toBe(true);
    expect(shouldSuppressPassiveOfferReschedule("established")).toBe(true);
  });
});
