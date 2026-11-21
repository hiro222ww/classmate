import { describe, expect, it } from "vitest";
import { buildDailyGenerateSystemPrompt } from "@/lib/marketing/prompts";

describe("buildDailyGenerateSystemPrompt strategy addon", () => {
  it("appends strategy and charter addons when provided", () => {
    const base = buildDailyGenerateSystemPrompt();
    const withAddon = buildDailyGenerateSystemPrompt({
      strategyAddon: "【適用中の改善方針】\n優先投稿タイプ: empathy",
      charterAddon: "【Classmate AI運営憲章】\n押し売り禁止",
    });
    expect(withAddon).toContain("押し売り禁止");
    expect(withAddon.startsWith(base)).toBe(true);
    expect(withAddon).toContain("優先投稿タイプ: empathy");
    expect(base).not.toContain("優先投稿タイプ: empathy");
  });
});
