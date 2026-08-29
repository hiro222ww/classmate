import { describe, expect, it } from "vitest";
import { isSessionOpenForMatchJoin } from "@/lib/sessionJoinLock";

describe("isSessionOpenForMatchJoin", () => {
  const now = Date.parse("2026-08-28T12:00:00.000Z");

  it("allows unlocked sessions with no join window", () => {
    expect(
      isSessionOpenForMatchJoin({
        membersLockedAt: null,
        joinOpenUntil: null,
        nowMs: now,
      })
    ).toBe(true);
  });

  it("allows unlocked sessions still inside join_open_until", () => {
    expect(
      isSessionOpenForMatchJoin({
        membersLockedAt: null,
        joinOpenUntil: "2026-08-28T12:00:30.000Z",
        nowMs: now,
      })
    ).toBe(true);
  });

  it("excludes sessions after join_open_until elapses", () => {
    expect(
      isSessionOpenForMatchJoin({
        membersLockedAt: null,
        joinOpenUntil: "2026-08-28T11:59:59.000Z",
        nowMs: now,
      })
    ).toBe(false);
  });

  it("excludes members_locked_at even if join window remains", () => {
    expect(
      isSessionOpenForMatchJoin({
        membersLockedAt: "2026-08-28T11:59:00.000Z",
        joinOpenUntil: "2026-08-28T12:30:00.000Z",
        nowMs: now,
      })
    ).toBe(false);
  });
});
