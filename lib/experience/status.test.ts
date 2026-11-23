import { describe, expect, it } from "vitest";
import { resolveExperiencePhase } from "@/lib/experience/status";

describe("resolveExperiencePhase", () => {
  const base = {
    featureEnabled: true,
    hasEvent: true,
    startsAtMs: 1_000,
    endsAtMs: 2_000,
    maxMembers: 5,
  };

  it("hides when feature off or no event", () => {
    expect(
      resolveExperiencePhase({
        ...base,
        featureEnabled: false,
        nowMs: 1_500,
        memberCount: 0,
      })
    ).toBe("hidden");
    expect(
      resolveExperiencePhase({
        ...base,
        hasEvent: false,
        nowMs: 1_500,
        memberCount: 0,
      })
    ).toBe("hidden");
  });

  it("covers upcoming / live / full / ended", () => {
    expect(
      resolveExperiencePhase({ ...base, nowMs: 500, memberCount: 0 })
    ).toBe("upcoming");
    expect(
      resolveExperiencePhase({ ...base, nowMs: 1_500, memberCount: 2 })
    ).toBe("live");
    expect(
      resolveExperiencePhase({ ...base, nowMs: 1_500, memberCount: 5 })
    ).toBe("full");
    expect(
      resolveExperiencePhase({ ...base, nowMs: 2_500, memberCount: 1 })
    ).toBe("ended");
  });

  it("never exceeds capacity semantics at boundary", () => {
    expect(
      resolveExperiencePhase({ ...base, nowMs: 1_500, memberCount: 4 })
    ).toBe("live");
    expect(
      resolveExperiencePhase({ ...base, nowMs: 1_500, memberCount: 5 })
    ).toBe("full");
    expect(
      resolveExperiencePhase({ ...base, nowMs: 1_500, memberCount: 6 })
    ).toBe("full");
  });
});
