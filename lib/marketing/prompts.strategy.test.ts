import { describe, expect, it } from "vitest";
import { buildDailyGenerateSystemPrompt } from "@/lib/marketing/prompts";

describe("buildDailyGenerateSystemPrompt strategy addon", () => {
  it("appends strategy addon when provided", () => {
    const base = buildDailyGenerateSystemPrompt();
    const withAddon = buildDailyGenerateSystemPrompt({
      strategyAddon: "【適用中の改善方針】\n優先投稿タイプ: empathy",
    });
    expect(withAddon.startsWith(base)).toBe(true);
    expect(withAddon).toContain("優先投稿タイプ: empathy");
    expect(base).not.toContain("優先投稿タイプ: empathy");
  });
});
