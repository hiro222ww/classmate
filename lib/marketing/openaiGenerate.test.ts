import { describe, expect, it } from "vitest";
import { buildTemplateFallbackPosts } from "@/lib/marketing/openaiGenerate";
import { MARKETING_POST_TYPES } from "@/lib/marketing/types";

describe("buildTemplateFallbackPosts", () => {
  it("returns one draft per post type under 140 chars", () => {
    const posts = buildTemplateFallbackPosts("2026-11-16");
    expect(posts).toHaveLength(3);
    expect(posts.map((p) => p.post_type).sort()).toEqual(
      [...MARKETING_POST_TYPES].sort()
    );
    for (const p of posts) {
      expect(p.body_text.length).toBeGreaterThan(10);
      expect(p.body_text.length).toBeLessThanOrEqual(140);
      expect(p.purpose).toBeTruthy();
      expect(p.target_audience).toBeTruthy();
      expect(p.cta).toBeTruthy();
    }
  });
});
