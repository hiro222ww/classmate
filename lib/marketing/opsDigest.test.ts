import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const keys = [
  "MARKETING_OPS_DIGEST_ENABLED",
  "MARKETING_ADMIN_NOTIFY_ENABLED",
  "MARKETING_ADMIN_NOTIFY_EMAIL",
  "MARKETING_DISCORD_WEBHOOK_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
] as const;

afterEach(() => {
  for (const k of keys) delete process.env[k];
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("sendMarketingOpsDigest", () => {
  it("stays disabled unless MARKETING_OPS_DIGEST_ENABLED=1", async () => {
    const { sendMarketingOpsDigest } = await import("@/lib/marketing/opsDigest");
    const result = await sendMarketingOpsDigest();
    expect(result.ok).toBe(true);
    expect(result.email?.status).toBe("disabled");
    expect(result.discord?.status).toBe("disabled");
  });

  it("never pulls user feedback or PII tables into the digest payload", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/marketing/opsDigest.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/user_feedback|feedback_messages|auth\.users/i);
    expect(src).toMatch(/marketing_posts/);
    expect(src).toMatch(/loadMarketingDashboardMetrics/);
    // Discord-only sends must still dedupe via fingerprint-discord
    expect(src).toMatch(/\$\{fingerprint\}-discord/);
    expect(src).toMatch(
      /fingerprints = \[fingerprint, `\$\{fingerprint\}-discord`\]/
    );
    expect(src).toMatch(/getMarketingPostReviewUrl/);
    expect(src).toMatch(/承認して今すぐ投稿/);
  });

  it("dedupes by JST calendar day, not by candidate id set", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/marketing/opsDigest.ts"),
      "utf8"
    );
    expect(src).toMatch(/ops_digest\|day\|\$\{jstDate\}/);
    expect(src).not.toMatch(/ops_digest\|\$\{params\.jstDate\}\|\$\{ids\}/);
    expect(src).toMatch(/本日の新規候補なし/);
    expect(src).toMatch(/already_sent_today_jst/);
  });

  it("proxy and digest route accept either CRON secret", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxy).toMatch(/unique\.includes\(provided\)/);
    expect(proxy).toMatch(/MARKETING_CRON_SECRET/);
    expect(proxy).toMatch(/CRON_SECRET/);

    const digest = readFileSync(
      join(process.cwd(), "app/api/admin/marketing/cron/digest/route.ts"),
      "utf8"
    );
    expect(digest).toMatch(/matchesMarketingCronSecret/);
    expect(digest).toMatch(/\[marketing\/cron\/digest\] failed/);
  });
});

