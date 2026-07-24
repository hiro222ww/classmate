import { test, expect } from "@playwright/test";
import { withDev } from "./helpers/config";
import { IN_APP_USER_AGENTS } from "./helpers/uas";
import { apiMatchJoin } from "./helpers/join";
import { skipWithoutBackend } from "./helpers/server";

test.describe("アプリ内ブラウザ UA 模擬", () => {
  for (const [key, preset] of Object.entries(IN_APP_USER_AGENTS)) {
    test(`${preset.label} UA で注意表示（Call）`, async ({ browser }) => {
      test.skip(await skipWithoutBackend(), "backend unavailable");

      const join = await apiMatchJoin({ deviceId: "test-device-81" });
      test.skip(!join.ok, join.error || "match-join failed");

      const context = await browser.newContext({
        userAgent: preset.ua,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();

      await page.goto(
        withDev(
          `/call?classId=${encodeURIComponent(join.classId!)}&sessionId=${encodeURIComponent(join.sessionId!)}`,
          "81"
        )
      );

      if (key === "line") {
        await expect(
          page.getByText("LINE内のブラウザでは通話機能を利用できません")
        ).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText("招待URLをコピー")).toBeVisible();
      } else {
        await expect(page.getByText("アプリ内ブラウザのご注意")).toBeVisible({
          timeout: 20_000,
        });
      }

      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/500|Internal Server Error/);

      await context.close();
    });
  }
});
