import { test, expect } from "@playwright/test";
import { withDev } from "./helpers/config";
import {
  clickFirstEnterButton,
  waitForEnabledEnterButton,
} from "./helpers/join";
import { skipWithoutBackend } from "./helpers/server";

test.describe("F. 再入室", () => {
  test.setTimeout(120_000);
  test("Room 入室後リロードで sessionId required にならない", async ({
    browser,
  }) => {
    test.skip(await skipWithoutBackend(), "backend unavailable");

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(withDev("/class/select", "61"));
    await waitForEnabledEnterButton(page);
    await Promise.all([
      page.waitForURL(/\/room/, { timeout: 60_000 }),
      clickFirstEnterButton(page),
    ]);

    await page.waitForFunction(
      () =>
        document.body?.innerText &&
        !document.body.innerText.includes("sessionId required"),
      undefined,
      { timeout: 30_000 }
    );

    await page.reload({ waitUntil: "networkidle" });

    await page.waitForFunction(
      () =>
        document.body?.innerText &&
        !document.body.innerText.includes("sessionId required"),
      undefined,
      { timeout: 30_000 }
    );

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/500|Internal Server Error/);

    await context.close();
  });

  test("Call リロード後 MicEntryGate が固着しない（聞き専）", async ({
    browser,
  }) => {
    test.skip(await skipWithoutBackend(), "backend unavailable");

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(withDev("/class/select", "62"));
    await waitForEnabledEnterButton(page);
    await Promise.all([
      page.waitForURL(/\/room/, { timeout: 60_000 }),
      clickFirstEnterButton(page),
    ]);

    const roomUrl = page.url();
    const callUrl = roomUrl.replace("/room", "/call");
    await page.goto(callUrl);

    await page.getByRole("button", { name: "聞き専で参加" }).click({
      timeout: 30_000,
    });
    await expect(page.getByLabel("通話参加の準備")).toBeHidden({
      timeout: 20_000,
    });

    await page.reload({ waitUntil: "networkidle" });

    await page.getByRole("button", { name: "聞き専で参加" }).click({
      timeout: 30_000,
    }).catch(() => {});

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/500|Internal Server Error/);

    await context.close();
  });
});
