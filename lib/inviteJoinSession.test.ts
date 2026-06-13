import { describe, expect, it } from "vitest";
import {
  evaluateOpenJoinedSessionReuse,
  normalizeSessionStatus,
} from "./recruitment";

describe("invite join session fallback", () => {
  const staleCreatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  it("treats forming session with members as reusable despite stale TTL", () => {
    const reuse = evaluateOpenJoinedSessionReuse({
      sessionStatus: "forming",
      sessionCreatedAt: staleCreatedAt,
      matchDeadlineAt: null,
      memberCount: 2,
      deviceIsSessionMember: false,
      recruitmentSessionTtlMinutes: 5,
      allowJoinActiveWithoutMembership: true,
      ignoreRecruitmentTtlWhenHasMembers: true,
    });

    expect(reuse.reusable).toBe(true);
  });

  it("does not reuse terminal expired session without members", () => {
    const reuse = evaluateOpenJoinedSessionReuse({
      sessionStatus: "expired",
      sessionCreatedAt: staleCreatedAt,
      matchDeadlineAt: null,
      memberCount: 0,
      deviceIsSessionMember: false,
      recruitmentSessionTtlMinutes: 5,
      allowJoinActiveWithoutMembership: true,
      ignoreRecruitmentTtlWhenHasMembers: true,
    });

    expect(reuse.reusable).toBe(false);
  });

  it("normalizes terminal session statuses", () => {
    expect(normalizeSessionStatus("ended")).toBe("ended");
    expect(normalizeSessionStatus("expired")).toBe("expired");
    expect(normalizeSessionStatus("closed")).toBe("closed");
  });
});
