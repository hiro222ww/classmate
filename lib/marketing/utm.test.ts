import { describe, expect, it } from "vitest";
import { buildMarketingTrackingUrl, truncateForX } from "@/lib/marketing/utm";

describe("buildMarketingTrackingUrl", () => {
  it("builds UTM link for X posts", () => {
    const url = buildMarketingTrackingUrl({
      channel: "x",
      campaign: "ai_marketing",
      content: "post_001",
      origin: "https://classmate-room.com",
    });
    expect(url).toBe(
      "https://classmate-room.com/?utm_source=x&utm_medium=social&utm_campaign=ai_marketing&utm_content=post_001"
    );
  });
});

describe("truncateForX", () => {
  it("keeps short text intact", () => {
    expect(truncateForX("短い投稿")).toBe("短い投稿");
  });

  it("truncates over 140 chars with ellipsis", () => {
    const long = "あ".repeat(150);
    const out = truncateForX(long);
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith("…")).toBe(true);
  });
});
