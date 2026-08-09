import { describe, expect, it } from "vitest";
import {
  CALL_JOIN_TRANSITION_GRACE_MS,
  CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
} from "@/lib/callMembersSync";
import {
  evaluateRemoteVoiceRepairEligibility,
  isMemberCallActive,
} from "@/lib/callPresenceGrace";
import { buildVoiceConnectionMembers } from "@/lib/voiceSessionMembers";

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

  it("case A/D: voice-layer call-active stays repairable past join grace", () => {
    const voice = buildVoiceConnectionMembers(
      [{ device_id: "remote-a", is_in_call: false, screen: "call" }],
      { sessionId: "sess", stable: true }
    )[0];

    const result = evaluateRemoteVoiceRepairEligibility({
      remoteId: "remote-a",
      selfDeviceId: "self",
      nowMs,
      member: voice,
      inSessionMembers: true,
      absentSinceMs: null,
      joinTransitionSinceMs: nowMs - CALL_JOIN_TRANSITION_GRACE_MS - 1,
      explicitRemoved: false,
    });
    expect(result.eligible).toBe(true);
  });

  it("case B: session + on call screen remains repairable without is_in_call", () => {
    const result = evaluateRemoteVoiceRepairEligibility({
      remoteId: "remote-a",
      selfDeviceId: "self",
      nowMs,
      member: { device_id: "remote-a", is_in_call: false, screen: "call" },
      inSessionMembers: true,
      absentSinceMs: null,
      joinTransitionSinceMs: nowMs - CALL_JOIN_TRANSITION_GRACE_MS - 1,
      explicitRemoved: false,
    });
    expect(result.eligible).toBe(true);
  });

  it("case C: confirmed left call is not repairable", () => {
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
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("confirmed_left_call");
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

  it("case E: explicit leave blocks repair", () => {
    const result = evaluateRemoteVoiceRepairEligibility({
      remoteId: "remote-a",
      selfDeviceId: "self",
      nowMs,
      member: { device_id: "remote-a", is_in_call: true, screen: "call" },
      inSessionMembers: true,
      absentSinceMs: null,
      joinTransitionSinceMs: null,
      explicitRemoved: true,
      explicitLeftIds: new Set(["remote-a"]),
    });
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("explicit_removed");
  });

  it("join_transition_expired when in session but voice member row missing past grace", () => {
    const result = evaluateRemoteVoiceRepairEligibility({
      remoteId: "remote-a",
      selfDeviceId: "self",
      nowMs,
      member: undefined,
      inSessionMembers: true,
      absentSinceMs: null,
      joinTransitionSinceMs: nowMs - CALL_JOIN_TRANSITION_GRACE_MS - 1,
      explicitRemoved: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("join_transition_expired");
  });
});
