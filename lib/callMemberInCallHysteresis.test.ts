import { describe, expect, it } from "vitest";
import {
  applyCallMemberInCallHysteresis,
  CALL_MEMBER_IN_CALL_HYSTERESIS_MS,
} from "./callMemberInCallHysteresis";

describe("applyCallMemberInCallHysteresis", () => {
  const sessionId = "sess-1";
  const viewer = "self";
  const remote = "peer1";
  const startedAt = 1_000_000;

  it("preserves remote in_call during hysteresis when presence says false", () => {
    const prev = [
      { device_id: viewer, is_in_call: true },
      { device_id: remote, is_in_call: true },
    ];
    const incoming = [
      { device_id: viewer, is_in_call: true },
      { device_id: remote, is_in_call: false },
    ];

    const out = applyCallMemberInCallHysteresis(prev, incoming, {
      sessionId,
      viewerDeviceId: viewer,
      firstFastMembersAt: startedAt,
      localExitedPeers: new Set(),
      fetchReason: "presence_sync",
      nowMs: startedAt + 1500,
    });

    expect(out.find((m) => m.device_id === remote)?.is_in_call).toBe(true);
  });

  it("drops removed members from incoming only", () => {
    const prev = [
      { device_id: viewer, is_in_call: true },
      { device_id: remote, is_in_call: true },
    ];
    const incoming = [{ device_id: viewer, is_in_call: true }];

    const out = applyCallMemberInCallHysteresis(prev, incoming, {
      sessionId,
      viewerDeviceId: viewer,
      firstFastMembersAt: startedAt,
      localExitedPeers: new Set(),
      nowMs: startedAt + 1500,
    });

    expect(out.some((m) => m.device_id === remote)).toBe(false);
  });

  it("applies false after hysteresis window", () => {
    const prev = [
      { device_id: viewer, is_in_call: true },
      { device_id: remote, is_in_call: true },
    ];
    const incoming = [
      { device_id: viewer, is_in_call: true },
      { device_id: remote, is_in_call: false },
    ];

    const out = applyCallMemberInCallHysteresis(prev, incoming, {
      sessionId,
      viewerDeviceId: viewer,
      firstFastMembersAt: startedAt,
      localExitedPeers: new Set(),
      nowMs: startedAt + CALL_MEMBER_IN_CALL_HYSTERESIS_MS + 1,
    });

    expect(out.find((m) => m.device_id === remote)?.is_in_call).toBe(false);
  });
});
