import { describe, expect, it } from "vitest";
import { CALL_LIVE_MEMBER_ABSENT_GRACE_MS } from "./callMembersSync";
import { mergeSessionMembersPreservingRemoved } from "./sessionMemberListMerge";

describe("mergeSessionMembersPreservingRemoved", () => {
  const sessionId = "sess-1";
  const now = 1_000_000;

  it("drops missing members after preserve grace expires", () => {
    const prev = [
      { device_id: "self", is_in_call: true },
      { device_id: "peer1", is_in_call: true },
    ];
    const incoming = [{ device_id: "self", is_in_call: true }];
    const memberLastInListAt = new Map([
      ["self", now],
      ["peer1", now - CALL_LIVE_MEMBER_ABSENT_GRACE_MS - 1],
    ]);

    const { merged, preservedIds } = mergeSessionMembersPreservingRemoved(
      prev,
      incoming,
      {
        sessionId,
        context: "call",
        memberLastInListAt,
        preserveGraceMs: CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
        nowMs: now,
      }
    );

    expect(merged.map((m) => m.device_id)).toEqual(["self"]);
    expect(preservedIds).toEqual([]);
  });

  it("preserves missing members within preserve grace", () => {
    const prev = [
      { device_id: "self", is_in_call: true },
      { device_id: "peer1", is_in_call: true },
    ];
    const incoming = [{ device_id: "self", is_in_call: true }];
    const memberLastInListAt = new Map([
      ["self", now],
      ["peer1", now - 2_000],
    ]);

    const { merged, preservedIds } = mergeSessionMembersPreservingRemoved(
      prev,
      incoming,
      {
        sessionId,
        context: "call",
        memberLastInListAt,
        preserveGraceMs: CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
        nowMs: now,
      }
    );

    expect(merged.map((m) => m.device_id).sort()).toEqual(["peer1", "self"]);
    expect(preservedIds).toEqual(["peer1"]);
  });

  it("does not preserve explicit left or left-call members", () => {
    const prev = [
      { device_id: "self", is_in_call: true, screen: "call" },
      { device_id: "left", is_in_call: false, screen: "room" },
      { device_id: "exited", is_in_call: true, screen: "call" },
    ];
    const incoming = [{ device_id: "self", is_in_call: true, screen: "call" }];
    const memberLastInListAt = new Map([
      ["self", now],
      ["left", now - 1_000],
      ["exited", now - 1_000],
    ]);

    const { merged, preservedIds } = mergeSessionMembersPreservingRemoved(
      prev,
      incoming,
      {
        sessionId,
        context: "call",
        explicitLeftIds: new Set(["exited"]),
        memberLastInListAt,
        preserveGraceMs: CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
        nowMs: now,
      }
    );

    expect(merged.map((m) => m.device_id)).toEqual(["self"]);
    expect(preservedIds).toEqual([]);
  });
});
