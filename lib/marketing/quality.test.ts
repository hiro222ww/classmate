import { describe, expect, it } from "vitest";
import {
  preferredTypesForDay,
  scoreMarketingDraft,
} from "@/lib/marketing/quality";

describe("scoreMarketingDraft", () => {
  it("penalizes hard promo and fake metrics", () => {
    const score = scoreMarketingDraft({
      post_type: "intro",
      body_text: "今すぐ登録！利用者10万人が神アプリと絶賛",
      purpose: "spam",
      target_audience: "everyone",
      expected_action: "register",
      cta: "今すぐ",
    });
    expect(score.pass).toBe(false);
    expect(score.accuracy).toBeLessThan(50);
  });

  it("passes a natural empathy draft", () => {
    const score = scoreMarketingDraft({
      post_type: "empathy",
      body_text:
        "社会人になると、ただ雑談する相手がいなくなる。今日あったどうでもいい話をしたい夜、ありませんか。",
      purpose: "共感",
      target_audience: "18-29",
      expected_action: "like",
      cta: "",
    });
    expect(score.pass).toBe(true);
    expect(score.total).toBeGreaterThanOrEqual(62);
  });
});

describe("preferredTypesForDay", () => {
  it("returns three distinct types", () => {
    const types = preferredTypesForDay("2026-11-16");
    expect(types).toHaveLength(3);
    expect(new Set(types).size).toBe(3);
  });
});
