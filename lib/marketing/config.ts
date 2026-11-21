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

/** Weekly analysis cron — separate gate; default off. */
export function isMarketingWeeklyCronEnabled(): boolean {
  return String(process.env.MARKETING_WEEKLY_CRON_ENABLED ?? "").trim() === "1";
}

/**
 * Shared secret for daily/weekly marketing cron.
 * Prefers MARKETING_CRON_SECRET; falls back to Vercel `CRON_SECRET`
 * (auto-sent as Authorization: Bearer on scheduled invocations).
 */
export function getMarketingCronSecret(): string {
  return (
    process.env.MARKETING_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

/** Soft weekly budget for analysis reports (default $2). */
export function getMarketingWeeklyBudgetUsd(): number {
  const raw = Number(process.env.MARKETING_WEEKLY_BUDGET_USD ?? "2");
  return Number.isFinite(raw) && raw > 0 ? raw : 2;
}

/** Max weekly_report runs per rolling 7 days (default 5). */
export function getMarketingWeeklyRunLimit(): number {
  const raw = Number(process.env.MARKETING_WEEKLY_RUN_LIMIT ?? "5");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

/**
 * Operator email alerts for improvement proposals.
 * Default OFF — requires MARKETING_ADMIN_NOTIFY_ENABLED=1 after approval.
 */
export function isMarketingAdminNotifyEnabled(): boolean {
  return String(process.env.MARKETING_ADMIN_NOTIFY_ENABLED ?? "").trim() === "1";
}

export function getMarketingAdminNotifyEmail(): string {
  return (
    process.env.MARKETING_ADMIN_NOTIFY_EMAIL?.trim() ||
    process.env.ADMIN_NOTIFY_EMAIL?.trim() ||
    ""
  );
}

/**
 * Evening ops digest: results so far + suggested drafts for tonight.
 * Default OFF — set MARKETING_OPS_DIGEST_ENABLED=1 after channels are configured.
 */
export function isMarketingOpsDigestEnabled(): boolean {
  return String(process.env.MARKETING_OPS_DIGEST_ENABLED ?? "").trim() === "1";
}

/** Discord incoming webhook URL (server-only). Empty = Discord channel off. */
export function getMarketingDiscordWebhookUrl(): string {
  return (
    process.env.MARKETING_DISCORD_WEBHOOK_URL?.trim() ||
    process.env.DISCORD_MARKETING_WEBHOOK_URL?.trim() ||
    ""
  );
}

/** 19:00 JST = 10:00 UTC */
export const MARKETING_OPS_DIGEST_CRON_EXPR_1900_JST = "0 10 * * *";

export function getMarketingOpsDigestScheduleHint(): string {
  return "Daily 19:00 JST (UTC 10:00; cron `0 10 * * *`) when MARKETING_OPS_DIGEST_ENABLED=1";
}

/** Public app origin for admin deep links in notifications. */
export function getMarketingAppOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://classmate-zeta-one.vercel.app";
  return raw.replace(/\/$/, "");
}

/**
 * Deep link to a single marketing draft in the admin UI.
 * Approve-and-publish-now remains a separate explicit click on that page.
 */
export function getMarketingPostReviewUrl(postId: string): string {
  const id = String(postId ?? "").trim();
  const origin = getMarketingAppOrigin();
  if (!id) return `${origin}/admin/marketing`;
  return `${origin}/admin/marketing?post=${encodeURIComponent(id)}`;
}

/**
 * Hard kill switch (env). When set to 1, even admin "approve and post now"
 * cannot call Buffer. Prefer app_settings toggle for day-to-day control.
 */
export function isMarketingBufferPublishForceOff(): boolean {
  return (
    String(process.env.MARKETING_BUFFER_PUBLISH_FORCE_OFF ?? "").trim() === "1"
  );
}

/**
 * Vercel cron expression for Sunday 20:00 JST (= Sunday 11:00 UTC).
 * Documented for operators; enabling still requires MARKETING_WEEKLY_CRON_ENABLED=1.
 */
export const MARKETING_WEEKLY_CRON_EXPR_SUNDAY_20_JST = "0 11 * * 0";

export function getMarketingWeeklyCronScheduleHint(): string {
  return "Sunday 20:00 JST (UTC 11:00; cron `0 11 * * 0`) when MARKETING_WEEKLY_CRON_ENABLED=1";
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
