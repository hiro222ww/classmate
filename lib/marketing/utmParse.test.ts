import { describe, expect, it } from "vitest";
import {
  hasAnyUtm,
  mergeUtmPreference,
  parseUtmFromSearch,
  sanitizeUtmValue,
} from "@/lib/marketing/utmParse";

describe("sanitizeUtmValue", () => {
  it("accepts safe campaign tokens", () => {
    expect(sanitizeUtmValue("ai_marketing")).toBe("ai_marketing");
    expect(sanitizeUtmValue("post_20261116_1")).toBe("post_20261116_1");
  });

  it("rejects unsafe values", () => {
    expect(sanitizeUtmValue("x<script>")).toBeNull();
    expect(sanitizeUtmValue("a b")).toBeNull();
    expect(sanitizeUtmValue("")).toBeNull();
  });
});

describe("parseUtmFromSearch", () => {
  it("parses query string", () => {
    const utm = parseUtmFromSearch(
      "?utm_source=x&utm_medium=social&utm_campaign=ai_marketing&utm_content=post_001"
    );
    expect(utm).toEqual({
      utm_source: "x",
      utm_medium: "social",
      utm_campaign: "ai_marketing",
      utm_content: "post_001",
    });
    expect(hasAnyUtm(utm)).toBe(true);
  });
});

describe("mergeUtmPreference", () => {
  it("keeps stored first-touch when URL has no UTM", () => {
    const stored = {
      utm_source: "x",
      utm_medium: "social",
      utm_campaign: "ai_marketing",
      utm_content: "post_001",
    };
    const empty = {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
    };
    expect(mergeUtmPreference(empty, stored)).toEqual(stored);
  });
});
