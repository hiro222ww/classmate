import { describe, expect, it } from "vitest";
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  buildHomeMetadata,
  buildPublicPageMetadata,
  buildWebApplicationJsonLd,
  buildWebsiteJsonLd,
} from "@/lib/seo";

describe("seo metadata", () => {
  it("home title and description stay within SEO-friendly length", () => {
    expect(HOME_TITLE).toContain("Classmate");
    expect(HOME_TITLE).toContain("同年代");
    expect(HOME_DESCRIPTION.length).toBeGreaterThanOrEqual(120);
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(HOME_DESCRIPTION).toContain("音声通話");
    expect(HOME_DESCRIPTION).toMatch(/友[だだ]ち/);
  });

  it("home metadata sets canonical and social cards", () => {
    const meta = buildHomeMetadata();
    expect(meta.alternates?.canonical).toBe("/");
    expect(meta.openGraph?.url).toBe("https://classmate-room.com/");
    expect(meta.twitter?.card).toBe("summary");
  });

  it("legal pages keep Classmate branding without outranking home title style", () => {
    const privacy = buildPublicPageMetadata({
      title: "プライバシーポリシー",
      description: "test",
      path: "/privacy",
      secondary: true,
    });
    expect(privacy.title).toBe("プライバシーポリシー");
    expect(privacy.alternates?.canonical).toBe("/privacy");
  });

  it("emits Website and WebApplication JSON-LD", () => {
    expect(buildWebsiteJsonLd()["@type"]).toBe("WebSite");
    expect(buildWebApplicationJsonLd()["@type"]).toBe("WebApplication");
  });
});
