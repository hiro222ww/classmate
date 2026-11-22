import { describe, expect, it } from "vitest";
import { evaluateReplyDraft } from "@/lib/marketing/replySuggestions";
import { parseXStatusUrl } from "@/lib/marketing/fetchPublicXPost";

describe("parseXStatusUrl", () => {
  it("parses x.com and twitter.com status URLs", () => {
    expect(
      parseXStatusUrl("https://x.com/someone/status/2124134106938155024")
    ).toEqual({
      sourceUrl: "https://x.com/someone/status/2124134106938155024",
      sourceAuthor: "someone",
      sourcePostId: "2124134106938155024",
    });
    expect(
      parseXStatusUrl("https://twitter.com/foo_bar/status/1?s=20")
    ).toMatchObject({
      sourceAuthor: "foo_bar",
      sourcePostId: "1",
    });
  });

  it("rejects non-status URLs", () => {
    expect(parseXStatusUrl("https://x.com/someone")).toBeNull();
    expect(parseXStatusUrl("not a url")).toBeNull();
  });
});

describe("evaluateReplyDraft", () => {
  it("flags promotional URL-heavy replies", () => {
    const ev = evaluateReplyDraft(
      "今すぐ登録してください https://classmate-room.com/?x=1"
    );
    expect(ev.promo_score).toBeGreaterThan(50);
    expect(ev.notes.some((n) => /URL|宣伝/.test(n))).toBe(true);
  });

  it("scores natural conversational replies higher", () => {
    const natural = evaluateReplyDraft(
      "わかる、自分も夜に声で雑談したくなることある。"
    );
    const promo = evaluateReplyDraft("今すぐ登録！フォローしてDMください！！");
    expect(natural.naturalness_score).toBeGreaterThan(promo.naturalness_score);
    expect(natural.promo_score).toBeLessThan(promo.promo_score);
  });
});
