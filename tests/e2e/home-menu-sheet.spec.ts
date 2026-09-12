import { expect, test } from "@playwright/test";

/**
 * Home menu must hug content down to the last row, and stay portaled to
 * `document.body` so page ancestors (`overflow:hidden`) cannot clip it.
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
});

const MENU_LABELS = [
  "通知",
  "プロフィール編集",
  "マイクラス",
  "プランを見る",
  "お支払い・解約",
  "Classmateについて",
  "規約・ポリシー",
] as const;

test.describe("home menu bottom sheet", () => {
  test("portals to document.body and shows every menu row", async ({
    page,
  }) => {
    await page.goto("/dev/home-menu");
    await expect(page.locator(".cm-bottom-sheet-scroll")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".cm-bottom-sheet")
          .evaluate((el) => getComputedStyle(el).transform)
      )
      .toBe("matrix(1, 0, 0, 1, 0, 0)");

    const sheet = page.locator(".cm-bottom-sheet");
    for (const label of MENU_LABELS) {
      await expect(sheet.getByText(label, { exact: true })).toBeVisible();
    }

    const structure = await page.evaluate(() => {
      const root = document.querySelector(".cm-bottom-sheet-root");
      const nav = document.querySelector(".cm-bottom-sheet-body nav");
      const rows = nav
        ? Array.from(nav.querySelectorAll("a, button")).map(
            (el) => el.textContent?.replace(/\s+/g, " ").trim() ?? ""
          )
        : [];
      return {
        parentIsBody: root?.parentElement === document.body,
        insideMain: Boolean(root?.closest("main")),
        rowCount: rows.length,
        rows,
      };
    });

    expect(structure.parentIsBody).toBe(true);
    expect(structure.insideMain).toBe(false);
    expect(structure.rowCount).toBeGreaterThanOrEqual(7);
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
        document.querySelectorAll(
          ".cm-bottom-sheet-body nav a, .cm-bottom-sheet-body nav button"
        )
      ).at(-1) as HTMLElement | undefined;
      if (!last) return null;
      const r = last.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const el = document.elementFromPoint(x, y);
      return {
        insideSheet: Boolean(el?.closest(".cm-bottom-sheet")),
        parentIsBody:
          document.querySelector(".cm-bottom-sheet-root")?.parentElement ===
          document.body,
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

    for (const label of MENU_LABELS) {
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

    expect(metrics.sheetBg).toMatch(/rgb\(\s*255,\s*255,\s*255\s*\)/);
    expect(metrics.sheetMaxHeight).not.toBe("none");
    expect(metrics.sheetOverflowY).toBe("hidden");
    expect(metrics.sheetPosition).toBe("absolute");
    expect(metrics.sheetBottomCss).toBe("0px");
    expect(metrics.scrollMaxHeight).toBe("none");
    expect(metrics.scrollOverflowY).toBe("auto");
    expect(metrics.inlineHeight).toBe("");
    expect(metrics.sheetHeight).toBeLessThan(metrics.viewportHeight * 0.7);
    expect(metrics.gapBelowLastItem).toBeLessThan(48);
  });
});
