import { describe, expect, it } from "vitest";
import {
  shouldShowAccountUnreadDot,
  sumClassUnreadCounts,
} from "./accountUnreadBadge";

describe("accountUnreadBadge", () => {
  it("sums positive unread counts only", () => {
    expect(
      sumClassUnreadCounts([
        { unread_count: 2 },
        { unread_count: 0 },
        { unread_count: 3 },
        { unread_count: null },
        null,
      ])
    ).toBe(5);
  });

  it("shows a dot only when counts are reliable and > 0", () => {
    expect(
      shouldShowAccountUnreadDot({
        unreadCountsReliable: true,
        unreadTotal: 2,
      })
    ).toBe(true);
    expect(
      shouldShowAccountUnreadDot({
        unreadCountsReliable: true,
        unreadTotal: 0,
      })
    ).toBe(false);
    expect(
      shouldShowAccountUnreadDot({
        unreadCountsReliable: false,
        unreadTotal: 9,
      })
    ).toBe(false);
  });
});
