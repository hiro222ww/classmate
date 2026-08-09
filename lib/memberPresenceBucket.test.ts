import { describe, expect, it } from "vitest";
import {
  getMemberPresenceStatus,
  mergePresenceSources,
  pickLatestPresenceByDeviceId,
  PRESENCE_HANDOFF_GRACE_MS,
  PRESENCE_ONLINE_FRESH_MS,
  resolvePresenceBucket,
} from "./memberPresenceBucket";
import { resolveInternalMemberStatus, toMemberPresenceStatus } from "./memberStatus";
import { evaluateCallParticipationPriority } from "./callStatusPriority";

const nowMs = Date.parse("2026-07-24T12:00:00.000Z");

function isoAgo(ms: number) {
  return new Date(nowMs - ms).toISOString();
}

describe("resolvePresenceBucket", () => {
  it("case1: fresh presence → online", () => {
    const a = resolvePresenceBucket({
      last_seen_at: isoAgo(5_000),
      is_in_call: false,
      screen: "room",
      nowMs,
    });
    const b = resolvePresenceBucket({
      last_seen_at: isoAgo(10_000),
      is_in_call: false,
      screen: "home",
      nowMs,
    });
    expect(a.bucket).toBe("online");
    expect(b.bucket).toBe("online");
  });

  it("case2: stale after timeout → offline", () => {
    const resolved = resolvePresenceBucket({
      last_seen_at: isoAgo(PRESENCE_ONLINE_FRESH_MS + 1),
      is_in_call: false,
      screen: "room",
      nowMs,
    });
    expect(resolved.bucket).toBe("offline");
    expect(resolved.reason).toBe("presence_stale");
  });

  it("case3: fresh + is_in_call + call screen → in_call", () => {
    const resolved = resolvePresenceBucket({
      last_seen_at: isoAgo(5_000),
      is_in_call: true,
      screen: "call",
      currentSessionId: "sess-a",
      presenceSessionId: "sess-a",
      nowMs,
    });
    expect(resolved.bucket).toBe("in_call");
  });

  it("case4: left call (room + is_in_call false or room screen) → online", () => {
    const left = resolvePresenceBucket({
      last_seen_at: isoAgo(5_000),
      is_in_call: false,
      screen: "room",
      nowMs,
    });
    const laggedFlag = resolvePresenceBucket({
      last_seen_at: isoAgo(5_000),
      is_in_call: true,
      screen: "room",
      nowMs,
    });
    expect(left.bucket).toBe("online");
    expect(laggedFlag.bucket).toBe("online");
  });

  it("case5: brief stale keeps previous online (no flicker)", () => {
    const resolved = resolvePresenceBucket({
      last_seen_at: isoAgo(PRESENCE_ONLINE_FRESH_MS + 5_000),
      is_in_call: false,
      screen: "room",
      previousBucket: "online",
      nowMs,
    });
    expect(resolved.bucket).toBe("online");
    expect(resolved.reason).toBe("presence_handoff_grace");
  });

  it("case5b: long stale after grace → offline", () => {
    const resolved = resolvePresenceBucket({
      last_seen_at: isoAgo(
        PRESENCE_ONLINE_FRESH_MS + PRESENCE_HANDOFF_GRACE_MS + 1
      ),
      is_in_call: false,
      screen: "room",
      previousBucket: "online",
      nowMs,
    });
    expect(resolved.bucket).toBe("offline");
  });

  it("case6: no presence → offline (membership irrelevant)", () => {
    const resolved = resolvePresenceBucket({
      last_seen_at: null,
      is_in_call: true,
      screen: "call",
      nowMs,
    });
    expect(resolved.bucket).toBe("offline");
    expect(resolved.reason).toBe("no_presence");
  });

  it("does not treat is_in_call=false as in_call", () => {
    const resolved = resolvePresenceBucket({
      last_seen_at: isoAgo(1_000),
      is_in_call: false,
      screen: "call",
      nowMs,
    });
    expect(resolved.bucket).toBe("online");
  });

  it("ignores in_call from another session", () => {
    const resolved = resolvePresenceBucket({
      last_seen_at: isoAgo(1_000),
      is_in_call: true,
      screen: "call",
      presenceSessionId: "sess-old",
      currentSessionId: "sess-new",
      nowMs,
    });
    expect(resolved.bucket).toBe("online");
  });
});

describe("pickLatestPresenceByDeviceId", () => {
  it("keeps newest last_seen per device", () => {
    const rows = pickLatestPresenceByDeviceId([
      { device_id: "d1", last_seen_at: isoAgo(20_000) },
      { device_id: "d1", last_seen_at: isoAgo(1_000) },
      { device_id: "d2", last_seen_at: isoAgo(5_000) },
    ]);
    expect(rows).toHaveLength(2);
    const d1 = rows.find((r) => r.device_id === "d1");
    expect(d1?.last_seen_at).toBe(isoAgo(1_000));
  });
});

describe("mergePresenceSources", () => {
  it("prefers fresher presence last_seen and flags", () => {
    const merged = mergePresenceSources(
      {
        is_in_call: true,
        screen: "call",
        last_seen_at: isoAgo(40_000),
      },
      {
        is_in_call: false,
        screen: "room",
        last_seen_at: isoAgo(1_000),
      }
    );
    expect(merged.last_seen_at).toBe(isoAgo(1_000));
    expect(merged.is_in_call).toBe(false);
    expect(merged.screen).toBe("room");
  });
});

describe("case7 cross-surface consistency", () => {
  it("same inputs yield same offline|online|in_call across home/room/call", () => {
    const shared = {
      last_seen_at: isoAgo(3_000),
      is_in_call: true as const,
      screen: "call",
      presenceSessionId: "sess-a",
      currentSessionId: "sess-a",
      nowMs,
    };

    expect(getMemberPresenceStatus(shared)).toBe("in_call");

    const home = toMemberPresenceStatus(
      resolveInternalMemberStatus({
        context: "home",
        deviceId: "peer",
        inSessionMembers: true,
        ...shared,
        is_in_call: true,
      }).internal
    );
    const room = toMemberPresenceStatus(
      resolveInternalMemberStatus({
        context: "room",
        deviceId: "peer",
        inSessionMembers: true,
        ...shared,
        is_in_call: true,
      }).internal
    );
    const call = evaluateCallParticipationPriority({
      nowMs,
      explicitLeft: false,
      inApiSessionMembers: true,
      absentSinceMs: null,
      isInCall: true,
      lastSeenAt: shared.last_seen_at,
      screen: "call",
    });

    expect(home).toBe("in_call");
    expect(room).toBe("in_call");
    expect(call.priority).toBe("in_call");
  });

  it("stale member is offline on home and room (membership alone ignored)", () => {
    const shared = {
      last_seen_at: isoAgo(PRESENCE_ONLINE_FRESH_MS + PRESENCE_HANDOFF_GRACE_MS + 1),
      is_in_call: true as const,
      screen: "call",
      nowMs,
    };
    expect(getMemberPresenceStatus(shared)).toBe("offline");
    expect(
      toMemberPresenceStatus(
        resolveInternalMemberStatus({
          context: "home",
          deviceId: "peer",
          inSessionMembers: true,
          inClassMembership: true,
          ...shared,
        }).internal
      )
    ).toBe("offline");
    expect(
      toMemberPresenceStatus(
        resolveInternalMemberStatus({
          context: "room",
          deviceId: "peer",
          inSessionMembers: true,
          ...shared,
        }).internal
      )
    ).toBe("offline");
  });
});
