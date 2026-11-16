import { describe, expect, it } from "vitest";
import {
  bodySimilarity,
  maxSimilarityAgainst,
} from "@/lib/marketing/similarity";

describe("bodySimilarity", () => {
  it("returns high score for near-duplicate Japanese copy", () => {
    const a = "大人になると新しい友だちを作る機会が減る";
    const b = "大人になると新しい友だちを作る機会が減る。";
    expect(bodySimilarity(a, b)).toBeGreaterThan(0.8);
  });

  it("returns low score for unrelated copy", () => {
    const a = "大人になると新しい友だちを作る機会が減る";
    const b = "今日の晩ごはんはカレーにしようかな";
    expect(bodySimilarity(a, b)).toBeLessThan(0.35);
  });
});

describe("maxSimilarityAgainst", () => {
  it("picks the strongest match from a list", () => {
    const candidate = "誰かと気軽に話したい夜";
    const score = maxSimilarityAgainst(candidate, [
      "完全に別の話題です",
      "誰かと気軽に話したい夜だ",
    ]);
    expect(score).toBeGreaterThan(0.5);
  });
});
