import { expect, test, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const POST_ID = "11111111-1111-4111-8111-111111111111";

const mockPost = {
  id: POST_ID,
  campaign_id: null,
  channel: "x",
  post_type: "value",
  status: "approved",
  body_text:
    "テスト投稿本文です。ゲートOFF時にボタンを押すと理由が表示されることを確認します。",
  purpose: null,
  target_audience: null,
  cta: null,
  utm_campaign: null,
  utm_content: null,
  tracking_url: "https://classmate.example/r/test",
  scheduled_at: null,
  published_at: null,
  rejected_at: null,
  rejection_reason: null,
  external_post_id: null,
  external_status: null,
  external_permalink: null,
  publish_attempts: 0,
  publish_claimed_at: null,
  publish_outcome: null,
  publish_error: null,
  charter_compliance: "ok",
  generation_source: "manual",
  similarity_score: null,
  quality_score: 80,
  quality_notes: null,
  model_name: null,
  prompt_tokens: null,
  completion_tokens: null,
  estimated_cost_usd: null,
  ai_run_id: null,
  created_at: "2026-11-21T00:00:00.000Z",
  updated_at: "2026-11-21T00:00:00.000Z",
};

async function mockMarketingApis(page: Page) {
  await page.route("**/api/admin/marketing/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();

    if (pathname.endsWith("/immediate-publish") && method === "GET") {
      return route.fulfill({
        json: { ok: true, enabled: false, forceOff: false },
      });
    }
    if (pathname.endsWith("/posts") && method === "GET") {
      return route.fulfill({ json: { ok: true, posts: [mockPost] } });
    }
    if (pathname.endsWith("/generate") && method === "GET") {
      return route.fulfill({
        json: {
          ok: true,
          openaiConfigured: true,
          cronEnabled: false,
          weeklyCronEnabled: false,
          activeStrategy: null,
          activeAdapter: "buffer",
          buffer: {
            credentialsPresent: true,
            channelIdConfigured: true,
            publishEnabled: false,
            note: "mock",
          },
        },
      });
    }
    if (pathname.endsWith("/metrics")) {
      return route.fulfill({
        json: { ok: false, error: "metrics_skipped_in_ui_test" },
      });
    }
    if (
      pathname.endsWith("/reports") ||
      pathname.endsWith("/strategies") ||
      pathname.includes("/proposals")
    ) {
      return route.fulfill({
        json: { ok: true, reports: [], versions: [], proposals: [] },
      });
    }
    if (pathname.endsWith("/publish-now") && method === "POST") {
      // Must not be reached when gate is OFF in UI, but refuse anyway.
      return route.fulfill({
        status: 403,
        json: {
          ok: false,
          error: "immediate_publish_disabled",
          detail: "gate off",
        },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });

  // Soften unrelated client noise.
  await page.route("**/*.supabase.co/**", (route) =>
    route.fulfill({ json: {} })
  );
  await page.route("**/api/profile**", (route) =>
    route.fulfill({ json: { ok: true, profile: null } })
  );
}

test.describe("publish-now gate-off feedback", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows sticky reason instead of silent no-op when gate is OFF", async ({
    page,
  }) => {
    const password = process.env.ADMIN_PASSWORD || "local-admin-ui-test";

    await mockMarketingApis(page);

    const login = await page.request.post("/api/admin/login", {
      data: { password },
    });
    expect(login.ok()).toBeTruthy();

    await page.goto(`/admin/marketing?post=${POST_ID}`);

    await expect(
      page.getByText(/即時投稿ゲート\(DB・再デプロイ不要\):\s*OFF/)
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/即時投稿ゲートがOFFのため、「承認して今すぐ投稿」は送信しません/)
    ).toBeVisible();

    const publishBtn = page
      .getByRole("button", { name: /承認して今すぐ投稿（ゲートOFF）/ })
      .first();
    await expect(publishBtn).toBeVisible({ timeout: 15_000 });
    await expect(publishBtn).toBeEnabled();

    await publishBtn.click();

    const banner = page.getByRole("status");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("即時投稿ゲートがOFF");

    // Must not open confirm-to-send while gate is OFF.
    await expect(
      page.getByRole("button", { name: "本当に今すぐ投稿する" })
    ).toHaveCount(0);

    const outDir = "/opt/cursor/artifacts";
    fs.mkdirSync(outDir, { recursive: true });
    const shot = path.join(outDir, "publish-now-gate-off-feedback-mobile.png");
    await page.screenshot({ path: shot, fullPage: false });
  });
});
