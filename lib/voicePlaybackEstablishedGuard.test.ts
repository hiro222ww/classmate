import { describe, expect, it } from "vitest";
import {
  evaluateVoicePeerMutationBlock,
  getEstablishedPeerAutoRecoverySkipReason,
  isManualVoicePeerReconnectMutation,
  shouldProtectVoicePeerFromAutoMutation,
} from "./voicePlaybackEstablishedGuard";

describe("voicePlaybackEstablishedGuard", () => {
  it("protects peers with playback evidence or strict confirm", () => {
    expect(
      shouldProtectVoicePeerFromAutoMutation({
        hasPlaybackEvidence: true,
        audioConfirmedStrict: false,
      })
    ).toBe(true);
    expect(
      shouldProtectVoicePeerFromAutoMutation({
        hasPlaybackEvidence: false,
        audioConfirmedStrict: true,
      })
    ).toBe(true);
    expect(
      shouldProtectVoicePeerFromAutoMutation({
        hasPlaybackEvidence: false,
        audioConfirmedStrict: false,
      })
    ).toBe(false);
  });

  it("blocks auto create when playback evidence exists", () => {
    const result = evaluateVoicePeerMutationBlock({
      kind: "create",
      evidence: {
        hasPlaybackEvidence: true,
        audioConfirmedStrict: false,
      },
      ctx: {
        reason: "heal_missing_pc_after_transport_failed",
        caller: "ensurePeerConnection",
      },
    });
    expect(result.blocked).toBe(true);
    expect(result.blockedByPlaybackEvidence).toBe(true);
  });

  it("allows manual reconnect mutations", () => {
    expect(
      isManualVoicePeerReconnectMutation({
        reason: "hard_reset_user_requested_audio_reconnect",
        caller: "runPeerHardReset",
      })
    ).toBe(true);
    expect(
      evaluateVoicePeerMutationBlock({
        kind: "close",
        evidence: {
          hasPlaybackEvidence: true,
          audioConfirmedStrict: true,
        },
        ctx: {
          reason: "hard_reset_user_requested_audio_reconnect",
          caller: "runPeerHardReset",
          manualHealPass: true,
        },
      }).blocked
    ).toBe(false);
  });

  it("returns skip reason preferring strict confirm", () => {
    expect(
      getEstablishedPeerAutoRecoverySkipReason({
        hasPlaybackEvidence: true,
        audioConfirmedStrict: true,
      })
    ).toBe("audio_confirmed_strict");
    expect(
      getEstablishedPeerAutoRecoverySkipReason({
        hasPlaybackEvidence: true,
        audioConfirmedStrict: false,
      })
    ).toBe("playback_evidence");
  });

  it("allows lifecycle close on member leave", () => {
    expect(
      evaluateVoicePeerMutationBlock({
        kind: "close",
        evidence: {
          hasPlaybackEvidence: true,
          audioConfirmedStrict: true,
        },
        ctx: {
          reason: "heal_member_left",
          caller: "healPeerConnections",
        },
      }).blocked
    ).toBe(false);
  });
});
