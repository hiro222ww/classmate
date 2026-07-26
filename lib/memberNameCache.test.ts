import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  deleteMemberNameCache,
  resolveCachedMemberName,
  setMemberNameCache,
  type MemberNameCache,
} from "./memberNameCache";
import { diffCallPresenceToasts } from "./callPresenceToasts";

describe("memberNameCache", () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores usable names and resolves by member id", () => {
    const cache: MemberNameCache = new Map();
    setMemberNameCache(cache, {
      userId: "user-1",
      memberId: "dev-1",
      displayName: "太郎",
    });
    expect(resolveCachedMemberName(cache, { memberId: "dev-1" })?.displayName).toBe(
      "太郎"
    );
    expect(logs.some((l) => l.includes("member-name-cache-set"))).toBe(true);
  });

  it("ignores fallback 参加者", () => {
    const cache: MemberNameCache = new Map();
    expect(
      setMemberNameCache(cache, {
        memberId: "dev-1",
        displayName: "参加者",
      })
    ).toBeNull();
    expect(cache.size).toBe(0);
  });

  it("uses cached name on leave after member disappears from nameById", () => {
    const cache: MemberNameCache = new Map();
    setMemberNameCache(cache, {
      userId: "dev-a",
      memberId: "dev-a",
      displayName: "花子",
    });

    const joined = diffCallPresenceToasts({
      previousIds: new Set(),
      nextIds: new Set(["dev-a"]),
      primed: true,
      selfDeviceId: "me",
      nameById: new Map([["dev-a", "花子"]]),
      nameCache: cache,
      recentKeys: new Set(),
      now: 1000,
    });
    expect(joined.toasts[0]?.message).toBe("花子さんが通話に参加しました");

    const left = diffCallPresenceToasts({
      previousIds: joined.nextPreviousIds,
      nextIds: new Set(),
      primed: true,
      selfDeviceId: "me",
      nameById: new Map(),
      nameCache: cache,
      recentKeys: joined.nextRecentKeys,
      now: 2000,
      leaveReason: "left_in_call_set",
      pruneNameCacheOnLeave: true,
    });

    expect(left.toasts.map((t) => t.message)).toEqual([
      "花子さんが通話から退出しました",
    ]);
    expect(logs.some((l) => l.includes("member-name-cache-hit-on-leave"))).toBe(
      true
    );
    expect(logs.some((l) => l.includes("member-left-toast"))).toBe(true);
    expect(resolveCachedMemberName(cache, { memberId: "dev-a" })).toBeNull();
  });

  it("logs miss and falls back when never cached", () => {
    const left = diffCallPresenceToasts({
      previousIds: new Set(["dev-x"]),
      nextIds: new Set(),
      primed: true,
      selfDeviceId: "me",
      nameById: new Map(),
      nameCache: new Map(),
      recentKeys: new Set(),
      now: 3000,
      leaveReason: "left_in_call_set",
    });
    expect(left.toasts[0]?.displayName).toBe("参加者");
    expect(logs.some((l) => l.includes("member-name-cache-miss-on-leave"))).toBe(
      true
    );
  });

  it("delete removes both keys", () => {
    const cache: MemberNameCache = new Map();
    setMemberNameCache(cache, {
      userId: "u1",
      memberId: "m1",
      displayName: "A",
    });
    deleteMemberNameCache(cache, { userId: "u1", memberId: "m1" });
    expect(cache.size).toBe(0);
  });
});
