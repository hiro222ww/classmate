import { describe, expect, it } from "vitest";
import {
  classifyVoicePeerHealth,
  clearVoicePeerHealthOnAudioConfirmedStrict,
  createVoicePeerHealthEntry,
  evaluateVoicePeerRepairAction,
  evaluateVoicePeerTransportFailure,
  recordVoicePeerRepairAction,
  shouldSkipVoicePeerRepair,
  shouldSuppressInboundHealthReconnectRequest,
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
    const nowMs = 100_000;
    const entry = createVoicePeerHealthEntry(nowMs - 20_000);
    const out = classifyVoicePeerHealth(
      baseSnapshot({
        nowMs,
        peerAgeMs: VOICE_PEER_HEALTH_UNCONFIRMED_MS + 500,
        inboundDeltaPackets: 1,
      }),
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
    const nowMs = 100_000;
    const entry = createVoicePeerHealthEntry(nowMs - 20_000);
    const snapshot = baseSnapshot({
      nowMs,
      peerAgeMs: VOICE_PEER_HEALTH_UNCONFIRMED_MS + 1000,
      inboundDeltaPackets: 1,
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
    const nowMs = 100_000;
    const entry = createVoicePeerHealthEntry(nowMs - 20_000);
    entry.lastRepairAt = nowMs - 1_000;
    const snapshot = baseSnapshot({
      nowMs,
      peerAgeMs: VOICE_PEER_HEALTH_UNCONFIRMED_MS + 1000,
      inboundDeltaPackets: 1,
    });
    const classification = classifyVoicePeerHealth(snapshot, entry);
    expect(
      evaluateVoicePeerRepairAction({ snapshot, entry, classification })
    ).toBeNull();

    entry.lastRepairAt = nowMs - VOICE_PEER_HEALTH_REPAIR_COOLDOWN_MS - 1;
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

  it("does not emit pending repair when strict confirmed", () => {
    const entry = createVoicePeerHealthEntry(1);
    clearVoicePeerHealthOnAudioConfirmedStrict(entry, 50_000);
    const snapshot = baseSnapshot({
      audioConfirmedStrict: true,
      peerAgeMs: VOICE_PEER_HEALTH_UNCONFIRMED_MS + 1000,
    });
    const classification = classifyVoicePeerHealth(snapshot, entry);
    expect(classification.state).toBe("healthy");
    expect(
      evaluateVoicePeerRepairAction({ snapshot, entry, classification })
    ).toBeNull();
  });

  it("does not emit pending repair when playback evidence exists", () => {
    const nowMs = 100_000;
    const entry = createVoicePeerHealthEntry(nowMs - 20_000);
    const snapshot = baseSnapshot({
      nowMs,
      peerAgeMs: VOICE_PEER_HEALTH_UNCONFIRMED_MS + 1000,
      hasPlaybackEvidence: true,
      inboundDeltaPackets: 1,
    });
    const classification = classifyVoicePeerHealth(snapshot, entry);
    expect(classification.state).toBe("healthy");
    expect(classification.reason).toBe("playback_evidence_pending_strict");
    expect(
      evaluateVoicePeerRepairAction({ snapshot, entry, classification })
    ).toBeNull();
  });

  it("keeps frozen strict peer healthy during short inbound packet gaps", () => {
    const entry = createVoicePeerHealthEntry(
      100_000 - VOICE_PEER_HEALTH_STALLED_INBOUND_MS - 100
    );
    clearVoicePeerHealthOnAudioConfirmedStrict(entry, 90_000);
    const snapshot = baseSnapshot({
      audioConfirmedStrict: false,
      inboundDeltaPackets: 0,
    });
    const classification = classifyVoicePeerHealth(snapshot, entry);
    expect(classification.state).toBe("healthy");
    expect(classification.reason).toBe("audio_confirmed_strict_frozen");
    expect(
      shouldSkipVoicePeerRepair({ snapshot, entry, classification })
    ).toBe("already_audio_confirmed");
  });

  it("suppresses inbound pending reconnect when strict and same connection", () => {
    expect(
      shouldSuppressInboundHealthReconnectRequest({
        resetReason: "health_audio_confirmed_strict_pending",
        incomingConnectionId: "conn-a",
        currentConnectionId: "conn-a",
        audioConfirmedStrict: true,
        autoRecoveryFrozen: false,
        hasPlaybackEvidence: false,
        transportDead: false,
      })
    ).toBe(true);
  });

  it("allows inbound pending reconnect when transport is dead", () => {
    expect(
      shouldSuppressInboundHealthReconnectRequest({
        resetReason: "health_audio_confirmed_strict_pending",
        incomingConnectionId: "conn-a",
        currentConnectionId: "conn-a",
        audioConfirmedStrict: true,
        autoRecoveryFrozen: false,
        hasPlaybackEvidence: false,
        transportDead: true,
      })
    ).toBe(false);
  });
});
