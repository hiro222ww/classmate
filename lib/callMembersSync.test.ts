import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CALL_MEMBERS_ACTIVE_POLL_MS,
  CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
  logCallMembersSync,
  logCallPeerAddRemote,
  logCallPeerRemoveRemote,
} from "./callMembersSync";

describe("callMembersSync", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => "1",
      setItem: () => {},
      removeItem: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports live sync timing constants", () => {
    expect(CALL_MEMBERS_ACTIVE_POLL_MS).toBe(4_000);
    expect(CALL_LIVE_MEMBER_ABSENT_GRACE_MS).toBe(12_000);
  });

  it("logCallMembersSync is a no-op when debug is off", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    expect(() =>
      logCallMembersSync({
        reason: "poll_active_call",
        prev: [{ device_id: "a" }],
        next: [{ device_id: "a" }, { device_id: "b" }],
      })
    ).not.toThrow();
  });

  it("logCallPeerAddRemote and logCallPeerRemoveRemote do not throw with debug on", () => {
    expect(() =>
      logCallPeerAddRemote({
        remoteId: "device-b",
        reason: "member_joined",
        role: "active",
      })
    ).not.toThrow();
    expect(() =>
      logCallPeerRemoveRemote({
        remoteId: "device-b",
        reason: "stale",
        graceMs: CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
      })
    ).not.toThrow();
  });
});
