/** Server-side marketing AI config. Never expose keys to the client. */

export function getMarketingOpenAiApiKey(): string {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_MARKETING_API_KEY?.trim() ||
    ""
  );
}

export function getMarketingOpenAiModel(): string {
  return (
    process.env.OPENAI_MARKETING_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

/** Soft daily budget ceiling in USD for generation (default $1). */
export function getMarketingDailyBudgetUsd(): number {
  const raw = Number(process.env.MARKETING_DAILY_BUDGET_USD ?? "1");
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/** Max generate runs per JST calendar day (default 20 including manual). */
export function getMarketingDailyRunLimit(): number {
  const raw = Number(process.env.MARKETING_DAILY_RUN_LIMIT ?? "20");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

export function isMarketingCronEnabled(): boolean {
  return String(process.env.MARKETING_CRON_ENABLED ?? "").trim() === "1";
}

export function getMarketingCronSecret(): string {
  return process.env.MARKETING_CRON_SECRET?.trim() || "";
}

/** Rough USD estimate for gpt-4o-mini-class pricing (override via env if needed). */
export function estimateOpenAiCostUsd(params: {
  promptTokens: number;
  completionTokens: number;
}): number {
  const inPerM = Number(process.env.OPENAI_MARKETING_INPUT_USD_PER_M ?? "0.15");
  const outPerM = Number(process.env.OPENAI_MARKETING_OUTPUT_USD_PER_M ?? "0.60");
  const input = (params.promptTokens / 1_000_000) * (Number.isFinite(inPerM) ? inPerM : 0.15);
  const output =
    (params.completionTokens / 1_000_000) * (Number.isFinite(outPerM) ? outPerM : 0.6);
  return Math.round((input + output) * 1_000_000) / 1_000_000;
}
