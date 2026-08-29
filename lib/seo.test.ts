import { describe, expect, it } from "vitest";
import {
  BRAND_LOGO_ALT,
  BRAND_LOGO_URL,
  HOME_DESCRIPTION,
  HOME_INTRO,
  HOME_TITLE,
  buildHomeMetadata,
  buildOrganizationJsonLd,
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
    expect(HOME_DESCRIPTION).toContain("Classmate（クラスメイト）");
    expect(HOME_INTRO).toContain("Classmate（クラスメイト）");
    expect(HOME_INTRO).toContain("通話");
  });

  it("home metadata sets canonical and social cards with brand logo", () => {
    const meta = buildHomeMetadata();
    expect(meta.alternates?.canonical).toBe("/");
    expect(meta.openGraph?.url).toBe("https://classmate-room.com/");
    expect(
      (meta.twitter as { card?: string } | undefined)?.card
    ).toBe("summary_large_image");
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: BRAND_LOGO_URL,
        alt: BRAND_LOGO_ALT,
      }),
    ]);
    expect(meta.twitter?.images).toEqual([BRAND_LOGO_URL]);
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

  it("emits Organization, Website and WebApplication JSON-LD with logo", () => {
    const organization = buildOrganizationJsonLd();
    expect(organization["@type"]).toBe("Organization");
    expect(organization.logo).toBe(BRAND_LOGO_URL);

    const website = buildWebsiteJsonLd();
    expect(website["@type"]).toBe("WebSite");
    expect(website.alternateName).toContain("Classmate（クラスメイト）");
    expect(website.image).toBe(BRAND_LOGO_URL);

    const app = buildWebApplicationJsonLd();
    expect(app["@type"]).toBe("WebApplication");
    expect(app.image).toBe(BRAND_LOGO_URL);
    expect(app.logo).toBe(BRAND_LOGO_URL);
  });
});
