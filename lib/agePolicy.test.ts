import { describe, expect, it } from "vitest";
import {
  applyAgeModeToMatchRange,
  canPersistMinorsOrAgeModeChange,
  checkSelfAgeForJoin,
  isProductionAgeLocked,
} from "@/lib/agePolicy";
import { scanContactRisk } from "@/lib/contentModeration";

describe("agePolicy production lock", () => {
  it("locks production when ALLOW_MINORS_EXPERIMENT is unset", () => {
    const prevNode = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_MINORS_EXPERIMENT;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_MINORS_EXPERIMENT;
    expect(isProductionAgeLocked()).toBe(true);
    expect(
      canPersistMinorsOrAgeModeChange({
        nextMinorsEnabled: true,
        nextAgeMode: "minor_separated_test",
      }).allowed
    ).toBe(false);
    process.env.NODE_ENV = prevNode;
    process.env.ALLOW_MINORS_EXPERIMENT = prevAllow;
  });

  it("blocks under-18 join in post_high_school_only", () => {
    expect(checkSelfAgeForJoin(17, "post_high_school_only").ok).toBe(false);
    expect(checkSelfAgeForJoin(18, "post_high_school_only").ok).toBe(true);
  });

  it("forces adult match range in post_high_school_only", () => {
    expect(
      applyAgeModeToMatchRange("post_high_school_only", 0, 25, 20)
    ).toEqual({ minAge: 18, maxAge: 25 });
  });
});

describe("contentModeration", () => {
  it("detects contact exchange patterns", () => {
    const hits = scanContactRisk("LINEで連絡して。渋谷駅で待ち合わせ");
    expect(hits.some((h) => h.code === "line")).toBe(true);
    expect(hits.some((h) => h.code === "meetup_time")).toBe(true);
  });
});
