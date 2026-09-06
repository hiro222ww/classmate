import { expect, test } from "@playwright/test";

/**
 * Home hamburger menu must hug content.
 * Root cause of the blank gap: max-height + overflow-y on `.cm-bottom-sheet`
 * (flex item) made iOS Safari use max-height as the used height.
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
        contentHeight: nav?.getBoundingClientRect().height ?? 0,
        viewportHeight: window.innerHeight,
        gapBelowLastItem: sheetBottom - lastBottom,
        sheetMaxHeight: cs.maxHeight,
        sheetOverflowY: cs.overflowY,
        scrollMaxHeight: scrollCs?.maxHeight ?? null,
        scrollOverflowY: scrollCs?.overflowY ?? null,
        inlineHeight: el.style.height,
      };
    });

    // Outer sheet must NOT carry max-height/overflow (iOS gap root cause).
    expect(metrics.sheetMaxHeight).toBe("none");
    expect(metrics.sheetOverflowY).toBe("visible");
    // Inner scroll owns the cap.
    expect(metrics.scrollMaxHeight).not.toBe("none");
    expect(metrics.scrollOverflowY).toBe("auto");
    // No JS height lock.
    expect(metrics.inlineHeight).toBe("");
    // Sheet hugs content — must not inflate toward ~80vh.
    expect(metrics.sheetHeight).toBeLessThan(metrics.viewportHeight * 0.7);
    // Gap under last row = body padding (+ optional safe-area on outer sheet).
    expect(metrics.gapBelowLastItem).toBeLessThan(48);
  });
});
