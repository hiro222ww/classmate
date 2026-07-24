import { describe, expect, it } from "vitest";
import { diffMemberJoinEvents } from "./memberJoinNotify";

describe("diffMemberJoinEvents", () => {
  it("does not emit on first prime", () => {
    const out = diffMemberJoinEvents({
      previousIds: new Set(),
      nextIds: new Set(["a", "b"]),
      primed: false,
      selfDeviceId: "me",
      nameById: new Map([
        ["a", "A"],
        ["b", "B"],
      ]),
      recentKeys: new Set(),
    });
    expect(out.events).toEqual([]);
    expect(out.primed).toBe(true);
  });

  it("emits only new members after prime and dedupes", () => {
    const first = diffMemberJoinEvents({
      previousIds: new Set(["a"]),
      nextIds: new Set(["a", "b"]),
      primed: true,
      selfDeviceId: "me",
      nameById: new Map([
        ["a", "A"],
        ["b", "太郎"],
      ]),
      recentKeys: new Set(),
      now: 1000,
    });
    expect(first.events.map((e) => e.message)).toEqual([
      "🎉 太郎さんがクラスに参加しました！",
    ]);

    const second = diffMemberJoinEvents({
      previousIds: first.nextPreviousIds,
      nextIds: new Set(["a", "b"]),
      primed: true,
      selfDeviceId: "me",
      nameById: new Map([
        ["a", "A"],
        ["b", "太郎"],
      ]),
      recentKeys: first.nextRecentKeys,
      now: 2000,
    });
    expect(second.events).toEqual([]);
  });

  it("soft resync updates baseline without events", () => {
    const out = diffMemberJoinEvents({
      previousIds: new Set(["a"]),
      nextIds: new Set(["a", "b", "c"]),
      primed: true,
      softResync: true,
      selfDeviceId: "me",
      nameById: new Map(),
      recentKeys: new Set(),
    });
    expect(out.events).toEqual([]);
    expect(out.nextPreviousIds.has("c")).toBe(true);
  });
});
