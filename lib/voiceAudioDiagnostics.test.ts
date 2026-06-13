import { describe, expect, it } from "vitest";
import {
  classifyOneWayAudioSubClass,
  CONFIRMED_LEVEL_THRESHOLD,
  evaluateAudioConfirmedStrict,
  hasRemotePlaybackStartedEvidence,
  hasStrongInboundPlaybackEvidence,
  type RemoteAudioConfirmInput,
} from "./voiceAudioDiagnostics";

describe("hasStrongInboundPlaybackEvidence", () => {
  it("rejects currentTime-only style signals without inbound or level", () => {
    expect(
      hasStrongInboundPlaybackEvidence({
        level: 0,
        inboundDeltaBytes: 0,
        inboundDeltaPackets: 0,
      })
    ).toBe(false);
  });

  it("accepts inbound packet growth", () => {
    expect(
      hasStrongInboundPlaybackEvidence({
        inboundDeltaPackets: 3,
      })
    ).toBe(true);
  });

  it("accepts inbound byte growth", () => {
    expect(
      hasStrongInboundPlaybackEvidence({
        inboundDeltaBytes: 120,
      })
    ).toBe(true);
  });

  it("accepts audio level above threshold", () => {
    expect(
      hasStrongInboundPlaybackEvidence({
        level: CONFIRMED_LEVEL_THRESHOLD,
      })
    ).toBe(true);
  });
});

describe("hasRemotePlaybackStartedEvidence", () => {
  it("allows soft connected when play started and track is not muted", () => {
    expect(
      hasRemotePlaybackStartedEvidence({
        playSuccess: true,
        trackLive: true,
        trackMuted: false,
      })
    ).toBe(true);
  });

  it("rejects muted remote track without inbound RTP", () => {
    expect(
      hasRemotePlaybackStartedEvidence({
        playSuccess: true,
        trackLive: true,
        trackMuted: true,
        inboundDeltaBytes: 0,
        inboundDeltaPackets: 0,
      })
    ).toBe(false);
  });

  it("allows muted remote track when inbound RTP is active", () => {
    expect(
      hasRemotePlaybackStartedEvidence({
        playSuccess: true,
        trackLive: true,
        trackMuted: true,
        inboundDeltaPackets: 2,
      })
    ).toBe(true);
  });
});

describe("evaluateAudioConfirmedStrict", () => {
  const baseInput: RemoteAudioConfirmInput = {
    hasElement: true,
    srcObjectSet: true,
    audioTracks: 1,
    trackReadyState: "live",
    trackMuted: false,
    playSuccess: true,
    paused: false,
    elementMuted: false,
    trackEnabled: true,
    currentTimeAdvanced: true,
    playbackActive: true,
    level: 0,
    inboundDeltaBytes: 0,
    inboundDeltaPackets: 0,
    playFailed: false,
  };

  it("does not confirm strict playback from currentTimeAdvanced alone", () => {
    expect(evaluateAudioConfirmedStrict(baseInput)).toBe(false);
  });

  it("confirms strict playback when inbound RTP is active", () => {
    expect(
      evaluateAudioConfirmedStrict({
        ...baseInput,
        inboundDeltaPackets: 1,
      })
    ).toBe(true);
  });
});

describe("classifyOneWayAudioSubClass", () => {
  it("classifies muted remote track without inbound RTP as D2", () => {
    expect(
      classifyOneWayAudioSubClass({
        iceConnected: true,
        remoteTrackReceived: true,
        inboundDeltaBytes: 0,
        inboundDeltaPackets: 0,
        playSuccess: true,
        playFailed: false,
        playbackStrict: false,
        currentTimeAdvanced: true,
        level: 0,
        outboundDeltaBytes: 100,
        senderTrackReadyState: "live",
        senderTrackMuted: false,
        senderTrackEnabled: true,
      })
    ).toBe("D2");
  });
});
