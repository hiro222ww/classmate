import { expect, test } from "@playwright/test";

/**
 * The home hamburger menu must hug its content on mobile viewports.
 * A tall empty white gap under the last row is the recurring production bug.
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
});

test.describe("home menu bottom sheet", () => {
  test("hugs content height and lists all rows on mobile", async ({ page }) => {
    await page.goto("/dev/home-menu");

    const sheet = page.locator(".cm-bottom-sheet");
    await expect(sheet).toBeVisible();

    const expectedLabels = [
      "通知",
      "プロフィール編集",
      "マイクラス",
      "プランを見る",
      "お支払い・解約",
      "Classmateについて",
      "規約・ポリシー",
    ];
    for (const label of expectedLabels) {
      await expect(sheet.getByText(label, { exact: true })).toBeVisible();
    }

    // Allow JS height lock (rAF / timeouts) to settle.
    await page.waitForTimeout(250);

    const metrics = await sheet.evaluate((el) => {
      const body = el.querySelector(".cm-bottom-sheet-body");
      const nav = body?.querySelector("nav");
      const sheetHeight = el.getBoundingClientRect().height;
      const contentBottom =
        nav?.getBoundingClientRect().bottom ?? el.getBoundingClientRect().bottom;
      const sheetBottom = el.getBoundingClientRect().bottom;
      return {
        sheetHeight,
        contentHeight: nav?.getBoundingClientRect().height ?? 0,
        viewportHeight: window.innerHeight,
        gapBelowContent: sheetBottom - contentBottom,
        inlineHeight: el.style.height,
      };
    });

    // Explicit pixel lock should be applied.
    expect(metrics.inlineHeight).toMatch(/^\d+px$/);
    // Sheet must not inflate toward ~80vh when content is shorter.
    expect(metrics.sheetHeight).toBeLessThan(metrics.viewportHeight * 0.7);
    // Empty gap under the last row must stay tiny (safe-area / padding only).
    expect(metrics.gapBelowContent).toBeLessThan(48);
    expect(metrics.sheetHeight - metrics.contentHeight).toBeLessThan(100);
  });
});
