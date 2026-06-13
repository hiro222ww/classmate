import { describe, expect, it } from "vitest";
import {
  evaluateVoiceSoftResetTrigger,
  isBidirectionalAudioEstablished,
} from "./voiceSoftReset";

describe("isBidirectionalAudioEstablished", () => {
  it("does not require outbound RTP while intentionally muted", () => {
    expect(
      isBidirectionalAudioEstablished({
        remoteTrackReceived: true,
        inboundDeltaBytes: 12,
        outboundDeltaBytes: 0,
        subClass: "OK",
        audioConfirmedStrict: false,
        hasPlaybackEvidence: false,
        userIntentionallyMuted: true,
      })
    ).toBe(true);
  });
});

describe("evaluateVoiceSoftResetTrigger", () => {
  const base = {
    joinAgeMs: 12_000,
    iceConnected: true,
    remoteTrackReceived: true,
    audioConfirmedStrict: false,
    hasPlaybackEvidence: false,
    inboundDeltaBytes: 0,
    outboundDeltaBytes: 0,
    subClass: "D2" as const,
    softResetAttempts: 0,
    lastSoftResetAt: null,
    negotiationComplete: true,
    passiveFallbackOfferSent: true,
    softResetAlreadyOnConnection: false,
  };

  it("skips one_way_rtp when muted user is not sending", () => {
    expect(
      evaluateVoiceSoftResetTrigger({
        ...base,
        inboundDeltaBytes: 10,
        outboundDeltaBytes: 0,
        subClass: "OK",
        userIntentionallyMuted: true,
      })
    ).toBeNull();
  });

  it("does not soft reset before negotiation is complete", () => {
    expect(
      evaluateVoiceSoftResetTrigger({
        ...base,
        negotiationComplete: false,
      })
    ).toBeNull();
  });

  it("triggers playback evidence timeout after negotiation completes", () => {
    expect(evaluateVoiceSoftResetTrigger(base)).toBe("track_no_playback_evidence");
  });

  it("does not repeat soft reset on the same connectionId", () => {
    expect(
      evaluateVoiceSoftResetTrigger({
        ...base,
        softResetAlreadyOnConnection: true,
        softResetAttempts: 1,
      })
    ).toBeNull();
  });
});
