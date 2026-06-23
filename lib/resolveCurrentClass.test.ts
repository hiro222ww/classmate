import { describe, expect, it } from "vitest";
import { pickPrimaryMembershipClassId } from "@/lib/pickPrimaryMembershipClass";
import type { ActiveClassMembershipRow } from "@/lib/activeClassMemberships";

function row(
  classId: string,
  joinedAt: string | null,
  isBillable = true
): ActiveClassMembershipRow {
  return {
    classId,
    className: classId,
    joinedAt,
    isLegacy: !isBillable,
    isBillable,
    classMissing: false,
  };
}

describe("pickPrimaryMembershipClassId", () => {
  it("picks the most recently joined billable class", () => {
    const visible = ["class-a", "class-b"];
    const rows = [
      row("class-a", "2024-01-01T00:00:00.000Z"),
      row("class-b", "2025-06-01T00:00:00.000Z"),
    ];

    expect(pickPrimaryMembershipClassId(visible, rows)).toBe("class-b");
  });

  it("ignores legacy rows when billable candidates exist", () => {
    const visible = ["legacy", "billable"];
    const rows = [
      row("legacy", "2025-06-02T00:00:00.000Z", false),
      row("billable", "2024-01-01T00:00:00.000Z", true),
    ];

    expect(pickPrimaryMembershipClassId(visible, rows)).toBe("billable");
  });

  it("returns null when there are no visible classes", () => {
    expect(pickPrimaryMembershipClassId([], [row("class-a", null)])).toBeNull();
  });
});
