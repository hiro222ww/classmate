import { describe, expect, it } from "vitest";
import {
  buildCallRecruitmentView,
  RECRUIT_SOFT_CLOSE_MEMBER_COUNT,
  recruitmentClosedUserMessage,
} from "@/lib/callRecruitmentUi";
import { LOBBY_WAIT_TIMEOUT_MS } from "@/lib/autoCallOnce";

describe("buildCallRecruitmentView", () => {
  const now = Date.parse("2026-08-29T12:00:00.000Z");

  it("shows recruiting for a single member under the soft-close threshold", () => {
    const view = buildCallRecruitmentView({
      memberCount: 1,
      capacity: 5,
      membersLockedAt: null,
      joinOpenUntil: null,
      sessionCreatedAt: new Date(now - 60_000).toISOString(),
      nowMs: now,
    });
    expect(view.phase).toBe("waiting_alone");
    expect(view.recruitingOpen).toBe(true);
    expect(view.label).toBe("募集中");
    expect(view.aloneWaitTimedOut).toBe(false);
  });

  it("marks alone wait timed out after 5 minutes for 1–2 members", () => {
    const view = buildCallRecruitmentView({
      memberCount: 2,
      capacity: 5,
      membersLockedAt: null,
      joinOpenUntil: null,
      sessionCreatedAt: new Date(now - LOBBY_WAIT_TIMEOUT_MS - 1).toISOString(),
      lobbyExtendedOnce: false,
      nowMs: now,
    });
    expect(view.memberCount).toBeLessThan(RECRUIT_SOFT_CLOSE_MEMBER_COUNT);
    expect(view.aloneWaitTimedOut).toBe(true);
    expect(view.canExtendAloneWait).toBe(true);
  });

  it("shows closing_soon while join_open_until remains", () => {
    const view = buildCallRecruitmentView({
      memberCount: 3,
      capacity: 5,
      membersLockedAt: null,
      joinOpenUntil: new Date(now + 20_000).toISOString(),
      sessionCreatedAt: new Date(now - 120_000).toISOString(),
      nowMs: now,
    });
    expect(view.phase).toBe("closing_soon");
    expect(view.recruitingOpen).toBe(true);
    expect(view.detail).toContain("あと");
  });

  it("shows closed when members are locked", () => {
    const view = buildCallRecruitmentView({
      memberCount: 5,
      capacity: 5,
      membersLockedAt: new Date(now - 1_000).toISOString(),
      joinOpenUntil: new Date(now - 1_000).toISOString(),
      nowMs: now,
    });
    expect(view.phase).toBe("closed");
    expect(view.recruitingOpen).toBe(false);
    expect(view.label).toBe("募集終了");
  });
});

describe("recruitmentClosedUserMessage", () => {
  it("explains locked sessions clearly", () => {
    expect(recruitmentClosedUserMessage("session_members_locked")).toContain(
      "締め切られました"
    );
  });
});
