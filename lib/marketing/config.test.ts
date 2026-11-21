import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  estimateOpenAiCostUsd,
  getMarketingCronSecret,
  getMarketingDailyBudgetUsd,
  getMarketingDailyRunLimit,
  getMarketingWeeklyBudgetUsd,
  getMarketingWeeklyCronScheduleHint,
  getMarketingWeeklyRunLimit,
  getMarketingOpsDigestScheduleHint,
  isMarketingAdminNotifyEnabled,
  isMarketingCronEnabled,
  isMarketingOpsDigestEnabled,
  isMarketingWeeklyCronEnabled,
  MARKETING_OPS_DIGEST_CRON_EXPR_1900_JST,
  MARKETING_WEEKLY_CRON_EXPR_SUNDAY_20_JST,
} from "@/lib/marketing/config";

const keys = [
  "MARKETING_DAILY_BUDGET_USD",
  "MARKETING_DAILY_RUN_LIMIT",
  "MARKETING_CRON_ENABLED",
  "MARKETING_WEEKLY_CRON_ENABLED",
  "MARKETING_WEEKLY_BUDGET_USD",
  "MARKETING_WEEKLY_RUN_LIMIT",
  "MARKETING_ADMIN_NOTIFY_ENABLED",
  "MARKETING_ADMIN_NOTIFY_EMAIL",
  "MARKETING_OPS_DIGEST_ENABLED",
  "MARKETING_DISCORD_WEBHOOK_URL",
  "MARKETING_CRON_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_ORIGIN",
  "NEXT_PUBLIC_APP_URL",
] as const;

beforeEach(() => {
  for (const k of keys) delete process.env[k];
});

afterEach(() => {
  for (const k of keys) delete process.env[k];
});

describe("marketing config", () => {
  it("defaults budget and run limit", () => {
    expect(getMarketingDailyBudgetUsd()).toBe(1);
    expect(getMarketingDailyRunLimit()).toBe(20);
  });

  it("reads overrides", () => {
    process.env.MARKETING_DAILY_BUDGET_USD = "2.5";
    process.env.MARKETING_DAILY_RUN_LIMIT = "5";
    expect(getMarketingDailyBudgetUsd()).toBe(2.5);
    expect(getMarketingDailyRunLimit()).toBe(5);
  });

  it("keeps cron disabled unless explicitly 1", () => {
    expect(isMarketingCronEnabled()).toBe(false);
    process.env.MARKETING_CRON_ENABLED = "true";
    expect(isMarketingCronEnabled()).toBe(false);
    process.env.MARKETING_CRON_ENABLED = "1";
    expect(isMarketingCronEnabled()).toBe(true);
  });

  it("keeps weekly analysis cron disabled unless explicitly 1", () => {
    expect(isMarketingWeeklyCronEnabled()).toBe(false);
    process.env.MARKETING_WEEKLY_CRON_ENABLED = "yes";
    expect(isMarketingWeeklyCronEnabled()).toBe(false);
    process.env.MARKETING_WEEKLY_CRON_ENABLED = "1";
    expect(isMarketingWeeklyCronEnabled()).toBe(true);
  });

  it("defaults weekly budget and run limit", () => {
    expect(getMarketingWeeklyBudgetUsd()).toBe(2);
    expect(getMarketingWeeklyRunLimit()).toBe(5);
  });

  it("estimates mini-class token cost", () => {
    const cost = estimateOpenAiCostUsd({
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.75, 5);
  });

  it("keeps admin notify disabled unless explicitly 1", () => {
    expect(isMarketingAdminNotifyEnabled()).toBe(false);
    process.env.MARKETING_ADMIN_NOTIFY_ENABLED = "true";
    expect(isMarketingAdminNotifyEnabled()).toBe(false);
    process.env.MARKETING_ADMIN_NOTIFY_ENABLED = "1";
    expect(isMarketingAdminNotifyEnabled()).toBe(true);
  });

  it("documents Sunday 20:00 JST weekly cron", () => {
    expect(MARKETING_WEEKLY_CRON_EXPR_SUNDAY_20_JST).toBe("0 11 * * 0");
    expect(getMarketingWeeklyCronScheduleHint()).toContain("Sunday 20:00 JST");
  });

  it("keeps ops digest disabled unless explicitly 1", () => {
    expect(isMarketingOpsDigestEnabled()).toBe(false);
    process.env.MARKETING_OPS_DIGEST_ENABLED = "1";
    expect(isMarketingOpsDigestEnabled()).toBe(true);
    expect(MARKETING_OPS_DIGEST_CRON_EXPR_1900_JST).toBe("0 10 * * *");
    expect(getMarketingOpsDigestScheduleHint()).toContain("19:00 JST");
  });

  it("builds per-post admin review deep links", async () => {
    process.env.NEXT_PUBLIC_APP_ORIGIN = "https://example.test/";
    const { getMarketingPostReviewUrl } = await import("@/lib/marketing/config");
    expect(getMarketingPostReviewUrl("abc-123")).toBe(
      "https://example.test/admin/marketing?post=abc-123"
    );
  });

  it("prefers MARKETING_CRON_SECRET then CRON_SECRET", () => {
    expect(getMarketingCronSecret()).toBe("");
    process.env.CRON_SECRET = "vercel-cron";
    expect(getMarketingCronSecret()).toBe("vercel-cron");
    process.env.MARKETING_CRON_SECRET = "marketing-cron";
    expect(getMarketingCronSecret()).toBe("marketing-cron");
  });
});
