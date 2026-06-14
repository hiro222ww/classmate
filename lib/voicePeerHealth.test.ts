import { describe, expect, it } from "vitest";
import {
  classifyVoicePeerHealth,
  createVoicePeerHealthEntry,
  evaluateVoicePeerRepairAction,
  evaluateVoicePeerTransportFailure,
  recordVoicePeerRepairAction,
  updateVoicePeerHealthObservations,
  VOICE_PEER_HEALTH_REPAIR_COOLDOWN_MS,
  VOICE_PEER_HEALTH_STALLED_INBOUND_MS,
  VOICE_PEER_HEALTH_UNCONFIRMED_MS,
} from "./voicePeerHealth";

function baseSnapshot(
  overrides: Partial<Parameters<typeof classifyVoicePeerHealth>[0]> = {}
) {
  const nowMs = 100_000;
  return {
    nowMs,
    remoteId: "peer-remote",
    joinAgeMs: 20_000,
    peerAgeMs: 20_000,
    audioConfirmedStrict: false,
    hasPlaybackEvidence: false,
    iceConnected: true,
    remoteTrackReceived: true,
    remoteTrackMuted: false,
    inboundDeltaPackets: 0,
    inboundDeltaBytes: 0,
    outboundDeltaBytes: 0,
    connectionState: "connected",
    iceConnectionState: "connected",
    awaitingActiveOffer: false,
    awaitingRemoteAnswer: false,
    softResetExhausted: false,
    hardResetExhausted: false,
    hardResetGiveUp: false,
    softResetBlocked: false,
    autoRecoveryFrozen: false,
    negotiationComplete: true,
    transportFailureReason: null,
    ...overrides,
  };
}

describe("voicePeerHealth", () => {
  it("classifies healthy when audio_confirmed_strict", () => {
    const entry = createVoicePeerHealthEntry(1);
    const out = classifyVoicePeerHealth(
      baseSnapshot({ audioConfirmedStrict: true }),
      entry
    );
    expect(out.state).toBe("healthy");
    expect(out.reason).toBe("audio_confirmed_strict");
  });

  it("classifies unconfirmed after grace without strict confirm", () => {
    const entry = createVoicePeerHealthEntry(1);
    const out = classifyVoicePeerHealth(
      baseSnapshot({ peerAgeMs: VOICE_PEER_HEALTH_UNCONFIRMED_MS + 500 }),
      entry
    );
    expect(out.state).toBe("unconfirmed");
    expect(out.reason).toBe("audio_confirmed_strict_pending");
  });

  it("classifies stalled when track applied but inbound stays zero", () => {
    const entry = createVoicePeerHealthEntry(
      100_000 - VOICE_PEER_HEALTH_STALLED_INBOUND_MS - 100
    );
    updateVoicePeerHealthObservations(entry, {
      nowMs: 100_000 - VOICE_PEER_HEALTH_STALLED_INBOUND_MS - 100,
      audioConfirmedStrict: false,
      remoteTrackReceived: true,
      inboundDeltaPackets: 0,
    });
    const out = classifyVoicePeerHealth(baseSnapshot(), entry);
    expect(out.state).toBe("stalled");
    expect(out.reason).toBe("track_applied_no_inbound_packets");
  });

  it("escalates unconfirmed to reconnect_request before soft reset", () => {
    const entry = createVoicePeerHealthEntry(1);
    const snapshot = baseSnapshot({
      peerAgeMs: VOICE_PEER_HEALTH_UNCONFIRMED_MS + 1000,
    });
    const classification = classifyVoicePeerHealth(snapshot, entry);
    const action = evaluateVoicePeerRepairAction({
      snapshot,
      entry,
      classification,
    });
    expect(action?.stage).toBe("reconnect_request");
  });

  it("escalates to soft_reset after reconnect_request is used", () => {
    const entry = createVoicePeerHealthEntry(1);
    entry.reconnectRequestCount = 1;
    const snapshot = baseSnapshot({
      peerAgeMs: VOICE_PEER_HEALTH_UNCONFIRMED_MS + 1000,
    });
    const classification = classifyVoicePeerHealth(snapshot, entry);
    const action = evaluateVoicePeerRepairAction({
      snapshot,
      entry,
      classification,
    });
    expect(action?.stage).toBe("soft_reset");
  });

  it("does not repair healthy peers", () => {
    const entry = createVoicePeerHealthEntry(1);
    const snapshot = baseSnapshot({ audioConfirmedStrict: true });
    const classification = classifyVoicePeerHealth(snapshot, entry);
    expect(
      evaluateVoicePeerRepairAction({ snapshot, entry, classification })
    ).toBeNull();
  });

  it("blocks repair during cooldown", () => {
    const entry = createVoicePeerHealthEntry(1);
    entry.lastRepairAt = 100_000 - 1_000;
    const snapshot = baseSnapshot({
      peerAgeMs: VOICE_PEER_HEALTH_UNCONFIRMED_MS + 1000,
    });
    const classification = classifyVoicePeerHealth(snapshot, entry);
    expect(
      evaluateVoicePeerRepairAction({ snapshot, entry, classification })
    ).toBeNull();
    recordVoicePeerRepairAction(
      entry,
      { stage: "reconnect_request", reason: "test" },
      100_000 - VOICE_PEER_HEALTH_REPAIR_COOLDOWN_MS - 1
    );
    const action = evaluateVoicePeerRepairAction({
      snapshot,
      entry,
      classification,
    });
    expect(action?.stage).toBe("reconnect_request");
  });

  it("detects transport failed for dead peers", () => {
    const reason = evaluateVoicePeerTransportFailure({
      connectionState: "failed",
      iceConnectionState: "failed",
      signalingState: "stable",
      timestamps: {
        lastPlaybackConfirmedAt: null,
        lastPlaybackActiveAt: null,
        lastPlaySuccessAt: null,
        lastOnTrackAt: null,
      },
      hasRemoteStream: false,
      hasPc: true,
      isOrphan: false,
      orphanSince: null,
      connectStartedAt: 80_000,
      p2pDirectFailedAt: null,
      nowMs: 100_000,
    });
    expect(reason).toBe("transport_failed");
  });
});
