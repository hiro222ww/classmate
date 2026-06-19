import { test, expect } from "@playwright/test";
import { withDev, withDebug } from "./helpers/config";
import { seedEmptyBrowserState } from "./helpers/device";
import {
  attachJoinListeners,
  clickFirstEnterButton,
  waitForEnabledEnterButton,
} from "./helpers/join";
import { skipWithoutBackend } from "./helpers/server";
import { isValidDeviceUuid } from "@/lib/deviceIdValidation";

test.describe("A. 新規ブラウザ状態", () => {
  test("Home → Select で500・白画面にならない（profile未登録）", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await seedEmptyBrowserState(context);
    const page = await context.newPage();
    const logs = attachJoinListeners(page);

    await page.goto(withDebug("/"));
    await expect(page.locator("body")).not.toContainText("500");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");

    await page.goto(withDebug("/class/select"));
    await expect(page.locator("body")).not.toContainText("500");

    await expect(
      page.getByText("プロフィール登録が必要").or(page.getByText("年齢では絞り込みません"))
    ).toBeVisible({ timeout: 30_000 });

    const storedId = await page.evaluate(() =>
      localStorage.getItem("classmate_device_id")
    );
    if (storedId) {
      expect(isValidDeviceUuid(storedId)).toBe(true);
    }

    await context.close();
  });

  test("dev入場: Select → Room（backend必要）", async ({ browser }) => {
    test.skip(await skipWithoutBackend(), "backend unavailable");

    const context = await browser.newContext();
    await seedEmptyBrowserState(context);
    const page = await context.newPage();
    const logs = attachJoinListeners(page);

    await page.goto(withDev("/class/select", "1"));
    await waitForEnabledEnterButton(page);

    await clickFirstEnterButton(page);
    await page.waitForURL(/\/room/, { timeout: 60_000 });

    await expect
      .poll(() => logs.some((line) => line.includes("[match-join] success")), {
        timeout: 10_000,
      })
      .toBe(true);

    const url = page.url();
    expect(url).toContain("sessionId=");
    expect(url).toContain("classId=");

    await page.waitForFunction(
      () =>
        document.body?.innerText &&
        !document.body.innerText.includes("sessionId required"),
      undefined,
      { timeout: 30_000 }
    );

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/match_join_failed|500|Internal Server Error/);

    await context.close();
  });
});
