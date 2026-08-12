import { describe, expect, it } from "vitest";
import { CALL_JOIN_TRANSITION_GRACE_MS } from "@/lib/callMembersSync";
import {
  createRemotePeerGraceRefs,
  getRemoteIdsWithMemberGrace,
  isPresenceConfirmedRemoteLeave,
  markSessionMemberRemoteIds,
  shouldApplyPresenceConfirmedLeaveCleanup,
  shouldEnsurePeerOnMemberListChange,
  shouldSuppressVoiceEpochResetForHealthyPeer,
} from "./callRemotePeerGrace";

describe("callRemotePeerGrace reconnect targeting", () => {
  it("does not add every session member into remoteIds", () => {
    const refs = createRemotePeerGraceRefs();
    const nowMs = Date.now();
    markSessionMemberRemoteIds(refs, ["peer-left", "peer-active"], nowMs);
    refs.lastStrictInCallAt.set("peer-active", nowMs);

    const { ids, graceIds } = getRemoteIdsWithMemberGrace(
      ["peer-active"],
      refs,
      nowMs,
      ["peer-left", "peer-active"]
    );

    expect(ids).toContain("peer-active");
    expect(ids).not.toContain("peer-left");
    expect(graceIds).not.toContain("peer-left");
  });

  it("detects presence-confirmed leave from room/home", () => {
    expect(
      isPresenceConfirmedRemoteLeave({
        is_in_call: false,
        screen: "room",
        last_seen_at: new Date().toISOString(),
      })
    ).toBe(true);
    expect(
      isPresenceConfirmedRemoteLeave({
        is_in_call: false,
        screen: "home",
        last_seen_at: new Date().toISOString(),
      })
    ).toBe(true);
    expect(
      isPresenceConfirmedRemoteLeave({
        is_in_call: true,
        screen: "call",
        last_seen_at: new Date().toISOString(),
      })
    ).toBe(false);
  });

  it("does not apply presence leave cleanup during join_transition", () => {
    const nowMs = 100_000;
    expect(
      shouldApplyPresenceConfirmedLeaveCleanup({
        isPresenceLeave: true,
        nowMs,
        joinTransitionSinceMs: nowMs - 1_000,
        joinTransitionGraceMs: CALL_JOIN_TRANSITION_GRACE_MS,
        lastStrictInCallAt: null,
        recentStrictGraceMs: 8_000,
        hasLivePeerEvidence: false,
      })
    ).toEqual({ apply: false, skipReason: "join_transition_hold" });
  });

  it("does not apply presence leave cleanup when live peer evidence exists", () => {
    expect(
      shouldApplyPresenceConfirmedLeaveCleanup({
        isPresenceLeave: true,
        nowMs: 100_000,
        joinTransitionSinceMs: null,
        joinTransitionGraceMs: CALL_JOIN_TRANSITION_GRACE_MS,
        lastStrictInCallAt: null,
        recentStrictGraceMs: 8_000,
        hasLivePeerEvidence: true,
      })
    ).toEqual({ apply: false, skipReason: "live_peer_evidence" });
  });

  it("does not apply presence leave cleanup for recent strict-in-call peer", () => {
    const nowMs = 100_000;
    expect(
      shouldApplyPresenceConfirmedLeaveCleanup({
        isPresenceLeave: true,
        nowMs,
        joinTransitionSinceMs: null,
        joinTransitionGraceMs: CALL_JOIN_TRANSITION_GRACE_MS,
        lastStrictInCallAt: nowMs - 2_000,
        recentStrictGraceMs: 8_000,
        hasLivePeerEvidence: false,
      })
    ).toEqual({ apply: false, skipReason: "recent_strict_in_call" });
  });

  it("applies presence leave cleanup for a true exit past grace", () => {
    const nowMs = 100_000;
    expect(
      shouldApplyPresenceConfirmedLeaveCleanup({
        isPresenceLeave: true,
        nowMs,
        joinTransitionSinceMs: nowMs - CALL_JOIN_TRANSITION_GRACE_MS - 1,
        joinTransitionGraceMs: CALL_JOIN_TRANSITION_GRACE_MS,
        lastStrictInCallAt: nowMs - 30_000,
        recentStrictGraceMs: 8_000,
        hasLivePeerEvidence: false,
      })
    ).toEqual({ apply: true });
  });

  it("only ensures newly joined or missing-PC remotes on member list change", () => {
    expect(
      shouldEnsurePeerOnMemberListChange({
        isNewlyJoinedRemote: false,
        hasUsablePc: true,
        isEstablishedHealthy: true,
      })
    ).toBe(false);

    expect(
      shouldEnsurePeerOnMemberListChange({
        isNewlyJoinedRemote: true,
        hasUsablePc: false,
        isEstablishedHealthy: false,
      })
    ).toBe(true);

    expect(
      shouldEnsurePeerOnMemberListChange({
        isNewlyJoinedRemote: false,
        hasUsablePc: false,
        isEstablishedHealthy: false,
      })
    ).toBe(true);
  });

  it("suppresses voiceEpoch reset for healthy established peers", () => {
    expect(
      shouldSuppressVoiceEpochResetForHealthyPeer({
        isEstablishedHealthy: true,
      })
    ).toBe(true);
    expect(
      shouldSuppressVoiceEpochResetForHealthyPeer({
        isEstablishedHealthy: false,
      })
    ).toBe(false);
  });
});
