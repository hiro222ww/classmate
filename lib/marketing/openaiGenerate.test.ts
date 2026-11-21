import { describe, expect, it } from "vitest";
import { buildTemplateFallbackPosts } from "@/lib/marketing/openaiGenerate";
import { MARKETING_POST_TYPES } from "@/lib/marketing/types";

describe("buildTemplateFallbackPosts", () => {
  it("returns three drafts of distinct types under 140 chars", () => {
    const posts = buildTemplateFallbackPosts("2026-11-16");
    expect(posts).toHaveLength(3);
    expect(new Set(posts.map((p) => p.post_type)).size).toBe(3);
    for (const p of posts) {
      expect(MARKETING_POST_TYPES).toContain(p.post_type);
      expect(p.body_text.length).toBeGreaterThan(10);
      expect(p.body_text.length).toBeLessThanOrEqual(140);
      expect(p.purpose).toBeTruthy();
      expect(p.expected_action).toBeTruthy();
      expect(p.body_text.includes("（別角度）")).toBe(false);
    }
  });

  it("prefers a less-similar variant when recent bodies match a template", () => {
    const recent = [
      "ひとりの夜、どっち？ A) 誰かと話したいけど相手がいない B) 話したい気持ちがわかない",
    ];
    const posts = buildTemplateFallbackPosts("2026-11-21", recent);
    const question = posts.find((p) => p.post_type === "question");
    expect(question).toBeTruthy();
    expect(question!.body_text).not.toContain("話したい気持ちがわかない");
  });
});
