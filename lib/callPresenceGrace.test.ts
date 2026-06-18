import { describe, expect, it } from "vitest";
import {
  CALL_JOIN_TRANSITION_GRACE_MS,
  CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
} from "@/lib/callMembersSync";
import {
  evaluateRemoteVoiceRepairEligibility,
  isMemberCallActive,
} from "@/lib/callPresenceGrace";

describe("callPresenceGrace", () => {
  const nowMs = 100_000;

  it("detects call-active members", () => {
    expect(
      isMemberCallActive({ is_in_call: true, screen: "call" })
    ).toBe(true);
    expect(
      isMemberCallActive({ is_in_call: true, screen: "room" })
    ).toBe(false);
  });

  it("allows repair during join transition for session members", () => {
    const result = evaluateRemoteVoiceRepairEligibility({
      remoteId: "remote-a",
      selfDeviceId: "self",
      nowMs,
      member: { device_id: "remote-a", is_in_call: false, screen: "room" },
      inSessionMembers: true,
      absentSinceMs: null,
      joinTransitionSinceMs: nowMs - 2_000,
      explicitRemoved: false,
    });
    expect(result.eligible).toBe(true);
  });

  it("blocks repair after join transition grace expires", () => {
    const result = evaluateRemoteVoiceRepairEligibility({
      remoteId: "remote-a",
      selfDeviceId: "self",
      nowMs,
      member: { device_id: "remote-a", is_in_call: false, screen: "room" },
      inSessionMembers: true,
      absentSinceMs: null,
      joinTransitionSinceMs: nowMs - CALL_JOIN_TRANSITION_GRACE_MS - 1,
      explicitRemoved: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("join_transition_expired");
  });

  it("holds repair while session member is missing but grace not expired", () => {
    const result = evaluateRemoteVoiceRepairEligibility({
      remoteId: "remote-a",
      selfDeviceId: "self",
      nowMs,
      member: undefined,
      inSessionMembers: false,
      absentSinceMs: nowMs - 2_000,
      joinTransitionSinceMs: null,
      explicitRemoved: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("remote_absent_grace_hold");
  });

  it("blocks repair after session absent grace expires", () => {
    const result = evaluateRemoteVoiceRepairEligibility({
      remoteId: "remote-a",
      selfDeviceId: "self",
      nowMs,
      member: undefined,
      inSessionMembers: false,
      absentSinceMs: nowMs - CALL_LIVE_MEMBER_ABSENT_GRACE_MS - 1,
      joinTransitionSinceMs: null,
      explicitRemoved: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("remote_absent_grace_expired");
  });
});
