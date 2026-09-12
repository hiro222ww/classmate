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
  test("raw diagnostics preserve normal menu geometry and paint styles", async ({ page }) => {
    const measure = () => page.locator(".cm-bottom-sheet").evaluate((sheet) => {
      const scroll = sheet.querySelector(".cm-bottom-sheet-scroll")!;
      return {
        rect: sheet.getBoundingClientRect().toJSON(),
        background: getComputedStyle(sheet).backgroundColor,
        scrollBackground: getComputedStyle(scroll).backgroundColor,
        text: sheet.textContent,
      };
    });
    await page.goto("/dev/home-menu");
    await expect(page.locator(".cm-bottom-sheet-scroll")).toBeVisible();
    await expect.poll(() => page.locator(".cm-bottom-sheet").evaluate((el) => getComputedStyle(el).transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
    const normal = await measure();
    const probes: Array<{ ancestors: unknown[]; rows: unknown[]; containers: unknown[] }> = [];
    page.on("console", (message) => {
      const prefix = "[bsdebug-paint] ";
      if (message.text().startsWith(prefix)) probes.push(JSON.parse(message.text().slice(prefix.length)));
    });
    await page.goto("/dev/home-menu?bsdebug=raw");
    await expect.poll(() => probes.length).toBeGreaterThan(0);
    await expect.poll(() => page.locator(".cm-bottom-sheet").evaluate((el) => getComputedStyle(el).transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
    expect(await measure()).toEqual(normal);
    await expect(page.locator(".cm-bs-geom-debug, .cm-bs-hit-marker, [data-deploy-debug], .cm-bottom-sheet-root--debug")).toHaveCount(0);
    // Portaled to body: root → body → html (and possibly others).
    expect(probes.at(-1)?.ancestors.length).toBeGreaterThanOrEqual(3);
    expect(probes.at(-1)?.rows).toHaveLength(8);
    expect(probes.at(-1)?.containers).toHaveLength(5);
    const parentIsBody = await page
      .locator(".cm-bottom-sheet-root")
      .evaluate((el) => el.parentElement === document.body);
    expect(parentIsBody).toBe(true);
  });

  test("stays visible when page main is short and overflow-hidden", async ({
    page,
  }) => {
    await page.goto("/dev/home-menu");
    await expect(page.locator(".cm-bottom-sheet")).toBeVisible();

    await page.evaluate(() => {
      const main = document.querySelector("main.cm-classroom-scope");
      if (!(main instanceof HTMLElement)) return;
      main.style.minHeight = "0";
      main.style.height = "240px";
      main.style.overflow = "hidden";
    });

    const sheet = page.locator(".cm-bottom-sheet");
    for (const label of [
      "マイクラス",
      "プランを見る",
      "お支払い・解約",
      "Classmateについて",
      "規約・ポリシー",
    ]) {
      const row = sheet.getByText(label, { exact: true });
      await expect(row).toBeVisible();
      await expect(row).toBeInViewport();
    }

    const paint = await page.evaluate(() => {
      const last = Array.from(
        document.querySelectorAll(".cm-bottom-sheet-body nav a, .cm-bottom-sheet-body nav button")
      ).at(-1) as HTMLElement | undefined;
      if (!last) return null;
      const r = last.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const el = document.elementFromPoint(x, y);
      return {
        x,
        y,
        hit: el
          ? `${el.tagName.toLowerCase()}.${String(el.className || "")
              .split(/\s+/)
              .slice(0, 2)
              .join(".")}`
          : null,
        insideSheet: Boolean(el?.closest(".cm-bottom-sheet")),
        parentIsBody: document.querySelector(".cm-bottom-sheet-root")?.parentElement === document.body,
      };
    });
    expect(paint?.parentIsBody).toBe(true);
    expect(paint?.insideSheet).toBe(true);
  });

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
