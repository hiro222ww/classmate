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
    expect(src).toMatch(/承認しても SNS/);
  });
});
