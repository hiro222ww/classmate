import { describe, expect, it } from "vitest";
import {
  deviceIdsFromMembers,
  mergeHomeRosterWithStatusMembers,
} from "@/lib/homeMembersMerge";

describe("mergeHomeRosterWithStatusMembers", () => {
  it("keeps members photo and overlays call status", () => {
    const { members, sessionMemberIds } = mergeHomeRosterWithStatusMembers(
      [
        {
          device_id: "a",
          display_name: "Alice",
          photo_path: "profiles/a.jpg",
          is_in_call: false,
        },
      ],
      [
        {
          device_id: "a",
          display_name: "A",
          photo_path: null,
          is_in_call: true,
          screen: "call",
          last_seen_at: "2026-01-01T00:00:00.000Z",
        },
        {
          device_id: "b",
          display_name: "Bob",
          photo_path: "profiles/b.jpg",
          is_in_call: false,
        },
      ]
    );

    expect(sessionMemberIds).toEqual(new Set(["a", "b"]));
    expect(members).toHaveLength(2);
    expect(members[0]?.photo_path).toBe("profiles/a.jpg");
    expect(members[0]?.is_in_call).toBe(true);
    expect(members[0]?.screen).toBe("call");
    expect(members[1]?.device_id).toBe("b");
  });
});

describe("deviceIdsFromMembers", () => {
  it("collects non-empty device ids", () => {
    expect(
      deviceIdsFromMembers([
        { device_id: "a" },
        { device_id: " " },
        { device_id: "b" },
      ])
    ).toEqual(new Set(["a", "b"]));
  });
});
