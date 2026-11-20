import { describe, expect, it } from "vitest";
import { buildCodeReviewUiSuggestions } from "@/lib/marketing/uiSuggestions";

describe("buildCodeReviewUiSuggestions", () => {
  it("covers required UX areas and marks non-measured as code_review/hypothesis", () => {
    const list = buildCodeReviewUiSuggestions();
    const areas = new Set(list.map((s) => s.area));
    for (const a of [
      "home_hero",
      "catchcopy",
      "buttons",
      "onboarding",
      "random_call",
      "waiting",
    ] as const) {
      expect(areas.has(a)).toBe(true);
    }
    expect(list.every((s) => s.evidenceKind !== "measured")).toBe(true);
    const hero = list.find((s) => s.area === "home_hero");
    expect(hero?.imagePrompt).toBeTruthy();
    expect(hero?.compositionNotes).toBeTruthy();
    expect(hero?.validationKpi).toBeTruthy();
  });
});
