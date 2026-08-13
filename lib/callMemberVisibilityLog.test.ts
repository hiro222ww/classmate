import { describe, expect, it } from "vitest";
import { shouldEmitProductionLogLine } from "@/lib/debugLog";
import {
  clearCallLeaveStickyForDevice,
  formatCallMemberVisibilityLog,
  resolveCallMemberUiExcludeReason,
  shouldClearStickyLeaveOnServerRejoin,
} from "@/lib/callMemberVisibilityLog";

const SESSION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_SESSION = "bbbbbbbb-bbbb-4ccc-8ddd-ffffffffffff";
const REMOTE = "device-xx3134";
const FRESH_SEEN = new Date().toISOString();
const STALE_SEEN = new Date(Date.now() - 120_000).toISOString();

function applyLocalLeftCallOverride(
  member: {
    device_id: string;
    is_in_call?: boolean;
    screen?: string | null;
  },
  localExitedPeers: Set<string>
) {
  if (!localExitedPeers.has(member.device_id)) return member;
  return { ...member, is_in_call: false, screen: "room" };
}

function simulateFetchCycle(params: {
  localExitedPeers: Set<string>;
  explicitRemovedPeers: Set<string>;
  raw: {
    device_id: string;
    is_in_call: boolean;
    screen: string | null;
    presence_session_id: string | null;
    last_seen_at: string | null;
  };
  viewerSessionId: string;
}) {
  const stickyBefore =
    params.localExitedPeers.has(params.raw.device_id) ||
    params.explicitRemovedPeers.has(params.raw.device_id);
  const clearEligibleByRaw = shouldClearStickyLeaveOnServerRejoin({
    viewerSessionId: params.viewerSessionId,
    presenceSessionId: params.raw.presence_session_id,
    is_in_call: params.raw.is_in_call,
    screen: params.raw.screen,
    last_seen_at: params.raw.last_seen_at,
  });
  if (clearEligibleByRaw) {
    clearCallLeaveStickyForDevice(
      {
        localExitedPeers: params.localExitedPeers,
        explicitRemovedPeers: params.explicitRemovedPeers,
      },
      params.raw.device_id
    );
  }
  const overridden = applyLocalLeftCallOverride(
    params.raw,
    params.localExitedPeers
  );
  const stickyAfter =
    params.localExitedPeers.has(params.raw.device_id) ||
    params.explicitRemovedPeers.has(params.raw.device_id);
  const includedInGrid =
    overridden.is_in_call === true &&
    String(overridden.screen ?? "").trim() === "call" &&
    !stickyAfter;
  return {
    stickyBefore,
    clearEligibleByRaw,
    stickyCleared: stickyBefore && !stickyAfter,
    overridden,
    includedInGrid,
  };
}

describe("shouldClearStickyLeaveOnServerRejoin", () => {
  it("clears only for fresh same-session in_call + screen=call", () => {
    expect(
      shouldClearStickyLeaveOnServerRejoin({
        viewerSessionId: SESSION,
        presenceSessionId: SESSION,
        is_in_call: true,
        screen: "call",
        last_seen_at: FRESH_SEEN,
      })
    ).toBe(true);
  });

  it("keeps sticky for raw false / room", () => {
    expect(
      shouldClearStickyLeaveOnServerRejoin({
        viewerSessionId: SESSION,
        presenceSessionId: SESSION,
        is_in_call: false,
        screen: "room",
        last_seen_at: FRESH_SEEN,
      })
    ).toBe(false);
  });

  it("does not clear for other session", () => {
    expect(
      shouldClearStickyLeaveOnServerRejoin({
        viewerSessionId: SESSION,
        presenceSessionId: OTHER_SESSION,
        is_in_call: true,
        screen: "call",
        last_seen_at: FRESH_SEEN,
      })
    ).toBe(false);
  });

  it("does not clear stale raw state", () => {
    expect(
      shouldClearStickyLeaveOnServerRejoin({
        viewerSessionId: SESSION,
        presenceSessionId: SESSION,
        is_in_call: true,
        screen: "call",
        last_seen_at: STALE_SEEN,
      })
    ).toBe(false);
  });
});

describe("server-confirmed rejoin sticky clear (before override)", () => {
  it("explicit leave → localExitedPeers set → hidden", () => {
    const localExitedPeers = new Set([REMOTE]);
    const explicitRemovedPeers = new Set([REMOTE]);
    const out = simulateFetchCycle({
      localExitedPeers,
      explicitRemovedPeers,
      viewerSessionId: SESSION,
      raw: {
        device_id: REMOTE,
        is_in_call: false,
        screen: "room",
        presence_session_id: SESSION,
        last_seen_at: FRESH_SEEN,
      },
    });
    expect(localExitedPeers.has(REMOTE)).toBe(true);
    expect(out.includedInGrid).toBe(false);
    expect(out.overridden.screen).toBe("room");
  });

  it("raw false / room → sticky maintained", () => {
    const localExitedPeers = new Set([REMOTE]);
    const explicitRemovedPeers = new Set([REMOTE]);
    const out = simulateFetchCycle({
      localExitedPeers,
      explicitRemovedPeers,
      viewerSessionId: SESSION,
      raw: {
        device_id: REMOTE,
        is_in_call: false,
        screen: "room",
        presence_session_id: SESSION,
        last_seen_at: FRESH_SEEN,
      },
    });
    expect(out.clearEligibleByRaw).toBe(false);
    expect(out.stickyCleared).toBe(false);
    expect(localExitedPeers.has(REMOTE)).toBe(true);
  });

  it("raw true / call → clear sticky before override → shown", () => {
    const localExitedPeers = new Set([REMOTE]);
    const explicitRemovedPeers = new Set([REMOTE]);
    const out = simulateFetchCycle({
      localExitedPeers,
      explicitRemovedPeers,
      viewerSessionId: SESSION,
      raw: {
        device_id: REMOTE,
        is_in_call: true,
        screen: "call",
        presence_session_id: SESSION,
        last_seen_at: FRESH_SEEN,
      },
    });
    expect(out.clearEligibleByRaw).toBe(true);
    expect(out.stickyCleared).toBe(true);
    expect(localExitedPeers.has(REMOTE)).toBe(false);
    expect(explicitRemovedPeers.has(REMOTE)).toBe(false);
    expect(out.overridden.is_in_call).toBe(true);
    expect(out.overridden.screen).toBe("call");
    expect(out.includedInGrid).toBe(true);
  });

  it("raw true / call + other session → no clear", () => {
    const localExitedPeers = new Set([REMOTE]);
    const explicitRemovedPeers = new Set([REMOTE]);
    const out = simulateFetchCycle({
      localExitedPeers,
      explicitRemovedPeers,
      viewerSessionId: SESSION,
      raw: {
        device_id: REMOTE,
        is_in_call: true,
        screen: "call",
        presence_session_id: OTHER_SESSION,
        last_seen_at: FRESH_SEEN,
      },
    });
    expect(out.clearEligibleByRaw).toBe(false);
    expect(localExitedPeers.has(REMOTE)).toBe(true);
    expect(out.includedInGrid).toBe(false);
  });

  it("stale raw state → no clear", () => {
    const localExitedPeers = new Set([REMOTE]);
    const out = simulateFetchCycle({
      localExitedPeers,
      explicitRemovedPeers: new Set([REMOTE]),
      viewerSessionId: SESSION,
      raw: {
        device_id: REMOTE,
        is_in_call: true,
        screen: "call",
        presence_session_id: SESSION,
        last_seen_at: STALE_SEEN,
      },
    });
    expect(out.clearEligibleByRaw).toBe(false);
    expect(localExitedPeers.has(REMOTE)).toBe(true);
  });

  it("rejoin then explicit leave hides again; repeated rejoin restores", () => {
    const localExitedPeers = new Set<string>();
    const explicitRemovedPeers = new Set<string>();

    for (let i = 0; i < 3; i += 1) {
      localExitedPeers.add(REMOTE);
      explicitRemovedPeers.add(REMOTE);

      const hidden = simulateFetchCycle({
        localExitedPeers,
        explicitRemovedPeers,
        viewerSessionId: SESSION,
        raw: {
          device_id: REMOTE,
          is_in_call: false,
          screen: "room",
          presence_session_id: SESSION,
          last_seen_at: FRESH_SEEN,
        },
      });
      expect(hidden.includedInGrid).toBe(false);

      const shown = simulateFetchCycle({
        localExitedPeers,
        explicitRemovedPeers,
        viewerSessionId: SESSION,
        raw: {
          device_id: REMOTE,
          is_in_call: true,
          screen: "call",
          presence_session_id: SESSION,
          last_seen_at: FRESH_SEEN,
        },
      });
      expect(shown.clearEligibleByRaw).toBe(true);
      expect(shown.stickyCleared).toBe(true);
      expect(shown.includedInGrid).toBe(true);
    }
  });
});

describe("formatCallMemberVisibilityLog", () => {
  it("emits success pattern for cleared rejoin", () => {
    const line = formatCallMemberVisibilityLog({
      deviceId: REMOTE,
      sessionId: SESSION,
      reason: "poll",
      rawInCall: true,
      rawScreen: "call",
      afterOverrideInCall: true,
      afterOverrideScreen: "call",
      localExitedPeers: false,
      explicitRemoved: false,
      sessionStorageLeft: false,
      confirmedLeftCall: false,
      clearEligibleByRaw: true,
      stickyCleared: true,
      inVisibleMembers: true,
      excludeReason: "shown",
    });
    expect(line).toContain("raw_in_call=1");
    expect(line).toContain("raw_screen=call");
    expect(line).toContain("clearEligibleByRaw=1");
    expect(line).toContain("stickyCleared=1");
    expect(line).toContain("inVisibleMembers=1");
    expect(shouldEmitProductionLogLine(line)).toBe(true);
  });

  it("flags uncleared sticky when clear eligible but sticky remains", () => {
    expect(
      resolveCallMemberUiExcludeReason({
        rawInCall: true,
        rawScreen: "call",
        localExitedPeers: true,
        explicitRemoved: false,
        sessionStorageLeft: false,
        afterOverrideInCall: false,
        afterOverrideScreen: "room",
        includedInGrid: false,
        clearEligibleByRaw: true,
      })
    ).toBe("sticky_leave_uncleared_despite_server_rejoin");
  });
});
