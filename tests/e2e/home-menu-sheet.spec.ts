import { expect, test } from "@playwright/test";

/**
 * Content-sized bottom sheet:
 * - Short menus: no max-height, hug last row (+ body pad + safe-area)
 * - Tall menus only: JS applies frozen px max-height + scroll overflow
 * - Never max-height + overflow:auto on the same node in default CSS
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
});

test.describe("home menu bottom sheet", () => {
  test("short menu hugs content without a permanent max-height", async ({
    page,
  }) => {
    await page.goto("/dev/home-menu");

    const sheet = page.locator(".cm-bottom-sheet");
    await expect(sheet).toBeVisible();

    for (const label of [
      "通知",
      "プロフィール編集",
      "マイクラス",
      "プランを見る",
      "お支払い・解約",
      "Classmateについて",
      "規約・ポリシー",
    ]) {
      await expect(sheet.getByText(label, { exact: true })).toBeVisible();
    }

    // Allow syncSize timeouts
    await page.waitForTimeout(250);

    const metrics = await sheet.evaluate((el) => {
      const scroll = el.querySelector(".cm-bottom-sheet-scroll");
      const body = el.querySelector(".cm-bottom-sheet-body");
      const nav = body?.querySelector("nav");
      const last = nav?.lastElementChild;
      const cs = getComputedStyle(el);
      const scrollCs = scroll ? getComputedStyle(scroll) : null;
      const sheetBottom = el.getBoundingClientRect().bottom;
      const lastBottom = last?.getBoundingClientRect().bottom ?? sheetBottom;
      return {
        sheetHeight: el.getBoundingClientRect().height,
        viewportHeight: window.innerHeight,
        gapBelowLastItem: sheetBottom - lastBottom,
        sheetMaxHeightCss: cs.maxHeight,
        sheetInlineMaxHeight: el.style.maxHeight,
        sheetOverflowY: cs.overflowY,
        scrollMaxHeight: scrollCs?.maxHeight ?? null,
        scrollOverflowY: scrollCs?.overflowY ?? null,
        cappedAttr: el.getAttribute("data-bs-capped"),
        sheetBg: cs.backgroundColor,
      };
    });

    // White painter
    expect(metrics.sheetBg).toMatch(/rgb\(\s*255,\s*255,\s*255\s*\)/);
    // Short fixture must NOT be capped to ~80vh
    expect(metrics.cappedAttr).toBe("0");
    expect(metrics.sheetInlineMaxHeight).toBe("");
    expect(metrics.sheetMaxHeightCss).toBe("none");
    // Scroll has no max-height; overflow stays visible when not capped
    expect(metrics.scrollMaxHeight).toBe("none");
    expect(metrics.scrollOverflowY).toBe("visible");
    expect(metrics.sheetHeight).toBeLessThan(metrics.viewportHeight * 0.7);
    // body pad (~20px) + optional safe-area on sheet
    expect(metrics.gapBelowLastItem).toBeGreaterThanOrEqual(16);
    expect(metrics.gapBelowLastItem).toBeLessThan(56);
  });
});
