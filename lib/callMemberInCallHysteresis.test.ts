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

  it("preserves remote in_call during hysteresis when presence says false on call screen", () => {
    const prev = [
      { device_id: viewer, is_in_call: true, screen: "call" },
      { device_id: remote, is_in_call: true, screen: "call" },
    ];
    const incoming = [
      { device_id: viewer, is_in_call: true, screen: "call" },
      { device_id: remote, is_in_call: false, screen: "call" },
    ];

    const out = applyCallMemberInCallHysteresis(prev, incoming, {
      sessionId,
      viewerDeviceId: viewer,
      firstFastMembersAt: startedAt,
      localExitedPeers: new Set(),
      memberLastInCallAt: new Map([[remote, startedAt]]),
      fetchReason: "presence_sync",
      nowMs: startedAt + 1500,
    });

    expect(out.find((m) => m.device_id === remote)?.is_in_call).toBe(true);
  });

  it("does not preserve remote who left to room screen", () => {
    const prev = [
      { device_id: viewer, is_in_call: true, screen: "call" },
      { device_id: remote, is_in_call: true, screen: "call" },
    ];
    const incoming = [
      { device_id: viewer, is_in_call: true, screen: "call" },
      { device_id: remote, is_in_call: false, screen: "room" },
    ];

    const out = applyCallMemberInCallHysteresis(prev, incoming, {
      sessionId,
      viewerDeviceId: viewer,
      firstFastMembersAt: startedAt,
      localExitedPeers: new Set(),
      memberLastInCallAt: new Map([[remote, startedAt]]),
      fetchReason: "presence_sync",
      nowMs: startedAt + 1500,
    });

    expect(out.find((m) => m.device_id === remote)?.is_in_call).toBe(false);
  });

  it("preserves missing remote during grace after fast hysteresis window", () => {
    const prev = [
      { device_id: viewer, is_in_call: true },
      { device_id: remote, is_in_call: true },
    ];
    const incoming = [{ device_id: viewer, is_in_call: true }];
    const lastInCallAt = new Map([[remote, startedAt + 20_000]]);

    const out = applyCallMemberInCallHysteresis(prev, incoming, {
      sessionId,
      viewerDeviceId: viewer,
      firstFastMembersAt: startedAt,
      localExitedPeers: new Set(),
      memberLastInCallAt: lastInCallAt,
      nowMs: startedAt + CALL_MEMBER_IN_CALL_HYSTERESIS_MS + 2000,
    });

    expect(out.some((m) => m.device_id === remote && m.is_in_call === true)).toBe(
      true
    );
  });

  it("drops missing remote after live absent grace expires", () => {
    const prev = [
      { device_id: viewer, is_in_call: true },
      { device_id: remote, is_in_call: true },
    ];
    const incoming = [{ device_id: viewer, is_in_call: true }];
    const lastInCallAt = new Map([[remote, startedAt]]);

    const out = applyCallMemberInCallHysteresis(prev, incoming, {
      sessionId,
      viewerDeviceId: viewer,
      firstFastMembersAt: startedAt,
      localExitedPeers: new Set(),
      memberLastInCallAt: lastInCallAt,
      nowMs:
        startedAt + CALL_MEMBER_IN_CALL_HYSTERESIS_MS + 15_000,
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
      memberLastInCallAt: new Map([[remote, startedAt]]),
      nowMs:
        startedAt + CALL_MEMBER_IN_CALL_HYSTERESIS_MS + 10_000,
    });

    expect(out.find((m) => m.device_id === remote)?.is_in_call).toBe(false);
  });
});
