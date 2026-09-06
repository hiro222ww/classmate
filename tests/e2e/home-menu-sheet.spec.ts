import { expect, test } from "@playwright/test";

/**
 * Home menu must hug content down to the last row.
 *
 * Blank-gap ownership:
 * - White fill: `.cm-bottom-sheet` (background:#fff)
 * - Height inflation: was `.cm-bottom-sheet-scroll` with max-height+overflow:auto
 *   (iOS used max-height as used height; parent grew and painted white)
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
});

test.describe("home menu bottom sheet", () => {
  test("hugs content; scroll has no max-height; sheet paints white", async ({
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
        scrollHeight: scroll?.getBoundingClientRect().height ?? 0,
        viewportHeight: window.innerHeight,
        gapBelowLastItem: sheetBottom - lastBottom,
        sheetBg: cs.backgroundColor,
        sheetMaxHeight: cs.maxHeight,
        sheetOverflowY: cs.overflowY,
        sheetPosition: cs.position,
        sheetBottomCss: cs.bottom,
        scrollMaxHeight: scrollCs?.maxHeight ?? null,
        scrollOverflowY: scrollCs?.overflowY ?? null,
        inlineHeight: el.style.height,
      };
    });

    // White painter is the sheet itself.
    expect(metrics.sheetBg).toMatch(/rgb\(\s*255,\s*255,\s*255\s*\)/);
    // Cap on sheet (clip), not on scrollport.
    expect(metrics.sheetMaxHeight).not.toBe("none");
    expect(metrics.sheetOverflowY).toBe("hidden");
    expect(metrics.sheetPosition).toBe("absolute");
    expect(metrics.sheetBottomCss).toBe("0px");
    // Scrollport must NOT carry max-height (reuniting with overflow:auto = iOS gap).
    expect(metrics.scrollMaxHeight).toBe("none");
    expect(metrics.scrollOverflowY).toBe("auto");
    expect(metrics.inlineHeight).toBe("");
    expect(metrics.sheetHeight).toBeLessThan(metrics.viewportHeight * 0.7);
    // body padding (+ optional safe-area on sheet)
    expect(metrics.gapBelowLastItem).toBeLessThan(48);
  });
});
