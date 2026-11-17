import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        order: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  },
}));

describe("buildPromptAddonFromGuidance", () => {
  let buildPromptAddonFromGuidance: typeof import("@/lib/marketing/strategy").buildPromptAddonFromGuidance;

  beforeAll(async () => {
    ({ buildPromptAddonFromGuidance } = await import("@/lib/marketing/strategy"));
  });

  it("includes type, ratio, hours, and uncertainty note", () => {
    const text = buildPromptAddonFromGuidance({
      preferredTypes: ["empathy", "question"],
      empathyToPromoRatio: "共感 7 : 宣伝 3",
      themeHints: ["少人数"],
      catchcopyHints: ["口語"],
      ctaHints: ["覗くだけOK"],
      preferredHoursJst: [21],
      avoidTopics: ["出会い目的"],
      notes: ["データ不足のため仮説"],
    });
    expect(text).toContain("優先投稿タイプ: empathy, question");
    expect(text).toContain("共感 7 : 宣伝 3");
    expect(text).toContain("21時台");
    expect(text).toContain("出会い目的");
    expect(text).toContain("サンプルが少ない場合は上記を強く押し出さないこと");
  });
});
