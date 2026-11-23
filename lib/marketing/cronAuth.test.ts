import { afterEach, describe, expect, it, vi } from "vitest";

const keys = ["MARKETING_CRON_SECRET", "CRON_SECRET"] as const;

afterEach(() => {
  for (const k of keys) delete process.env[k];
  vi.resetModules();
});

describe("matchesMarketingCronSecret", () => {
  it("accepts MARKETING_CRON_SECRET when only that is set", async () => {
    process.env.MARKETING_CRON_SECRET = "marketing-only";
    const { matchesMarketingCronSecret, hasMarketingCronSecretConfigured } =
      await import("@/lib/marketing/cronAuth");
    expect(hasMarketingCronSecretConfigured()).toBe(true);
    expect(matchesMarketingCronSecret("marketing-only")).toBe(true);
    expect(matchesMarketingCronSecret("wrong")).toBe(false);
  });

  it("accepts CRON_SECRET when only that is set (Vercel Cron path)", async () => {
    process.env.CRON_SECRET = "vercel-cron";
    const { matchesMarketingCronSecret } = await import(
      "@/lib/marketing/cronAuth"
    );
    expect(matchesMarketingCronSecret("vercel-cron")).toBe(true);
    expect(matchesMarketingCronSecret("")).toBe(false);
  });

  it("accepts either secret when both differ (Nov 22 miss root-cause class)", async () => {
    process.env.MARKETING_CRON_SECRET = "marketing-cron";
    process.env.CRON_SECRET = "vercel-cron";
    const { matchesMarketingCronSecret, getMarketingCronSecrets } =
      await import("@/lib/marketing/cronAuth");
    expect(getMarketingCronSecrets()).toEqual([
      "marketing-cron",
      "vercel-cron",
    ]);
    expect(matchesMarketingCronSecret("marketing-cron")).toBe(true);
    expect(matchesMarketingCronSecret("vercel-cron")).toBe(true);
    expect(matchesMarketingCronSecret("other")).toBe(false);
  });

  it("dedupes identical secrets", async () => {
    process.env.MARKETING_CRON_SECRET = "same";
    process.env.CRON_SECRET = "same";
    const { getMarketingCronSecrets } = await import(
      "@/lib/marketing/cronAuth"
    );
    expect(getMarketingCronSecrets()).toEqual(["same"]);
  });
});
