import { afterEach, describe, expect, it } from "vitest";
import {
  estimateOpenAiCostUsd,
  getMarketingDailyBudgetUsd,
  getMarketingDailyRunLimit,
  isMarketingCronEnabled,
} from "@/lib/marketing/config";

const keys = [
  "MARKETING_DAILY_BUDGET_USD",
  "MARKETING_DAILY_RUN_LIMIT",
  "MARKETING_CRON_ENABLED",
] as const;

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

  it("estimates mini-class token cost", () => {
    const cost = estimateOpenAiCostUsd({
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.75, 5);
  });
});
