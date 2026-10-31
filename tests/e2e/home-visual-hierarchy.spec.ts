import { expect, test, type Page } from "@playwright/test";

// Exercise the real routes without writing to a backend or joining real calls.
async function mockHomeData(page: Page) {
  const user = { id: "00000000-0000-4000-8000-000000000456", aud: "authenticated", role: "authenticated", is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  await page.addInitScript(() => localStorage.setItem("classmate_device_id", "00000000-0000-4000-8000-000000000123"));
  await page.route("**/*.supabase.co/**", route => route.fulfill({ json:
    new URL(route.request().url()).pathname.endsWith("/user") ? user :
      { access_token: token, refresh_token: "local-test-only", token_type: "bearer", expires_in: 3600, user },
  }));
  await page.route("**/api/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      "/api/profile": { ok: true, profile: { device_id: "00000000-0000-4000-8000-000000000123", display_name: "めいと", declared_age: 25, declared_age_as_of: "2026-09-01", minimum_profile: true } },
      "/api/auth/session": { ok: true, userId: user.id, deviceId: "00000000-0000-4000-8000-000000000123", isAnonymous: true, hasLinkedEmail: false },
      "/api/class/mine": { ok: true, classes: [] },
      "/api/me/current-class": { ok: true, currentClass: null },
      "/api/class/list": { ok: true, worlds: [], classes: [] },
      "/api/topics": { ok: true, topics: [
        { topic_key: "music", title: "音楽", description: "好きな音楽について話そう", monthly_price: 480, is_sensitive: false },
        { topic_key: "games", title: "ゲーム", description: "お気に入りのゲームの話", monthly_price: 480, is_sensitive: false },
      ] },
      "/api/admission/status": { ok: true, open: true, admissionWindowEnabled: false },
      "/api/user/entitlements": { ok: true, plan: "free", class_slots: 1, topic_plan: 0 },
      "/api/user/match-prefs": { ok: true, prefs: { min_age: 18, max_age: 120 } },
      "/api/class/match-join-v2": { ok: false, error: "test_only_no_join" },
    };
    return route.fulfill({ json: responses[pathname] ?? { ok: true } });
  });
}

async function checkActions(page: Page) {
  // Home RandomTalkCta uses short labels; select free board uses MatchEntryButton defaults.
  const voice = page
    .getByRole("button", { name: "通話", exact: true })
    .or(page.getByRole("button", { name: "通話で始める", exact: true }))
    .first();
  const chat = page
    .getByRole("button", { name: "チャット", exact: true })
    .or(page.getByRole("button", { name: "チャットで始める", exact: true }))
    .first();
  await expect(voice).toBeEnabled();
  await expect(chat).toBeEnabled();
  await expect(voice).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(chat).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(chat).toHaveCSS("border-top-width", "1px");
  await expect(chat).toHaveCSS("box-shadow", "none");
  for (const button of [voice, chat]) {
    await expect(button.locator("svg")).toHaveAttribute("stroke-width", "1.75");
    await expect(button.locator("svg")).toHaveAttribute("aria-hidden", "true");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test.describe(`${viewport.width}px layout`, () => {
    test.use({ viewport });
    test("home and theme selection retain actions with simpler hierarchy", async ({ page }, testInfo) => {
      await mockHomeData(page);
      await page.goto("/");
      await checkActions(page);
      const brand = page.getByRole("link", { name: "Classmate — ホームへ戻る" });
      await expect(brand).toHaveAttribute("href", "/");
      expect((await brand.boundingBox())!.height).toBeGreaterThanOrEqual(43);
      await expect(brand.locator("img")).toHaveCount(1);
      await expect(brand).toContainText("クラスメイト");
      await expect(page.locator(".cm-home-brand-visual-intro")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "探す", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "すべて見る", exact: true })).toHaveAttribute(
        "href",
        "/class/select"
      );
      // Home keeps only the four representative majors.
      await expect(page.locator(".cm-home-theme-grid-list .cm-home-theme-card")).toHaveCount(4);
      await expect(page.getByRole("link", { name: /学校・勉強/ })).toHaveAttribute(
        "href",
        "/class/select?cat=school"
      );
      await expect(page.getByRole("link", { name: /アイデンティティ/ })).toHaveCount(0);
      // One my-class section below talk; warm empty, create on the real section only.
      const myClassSection = page.locator("#cm-home-my-class");
      await expect(myClassSection.getByRole("heading", { name: "マイクラス", exact: true })).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "マイクラス", exact: true })).toHaveCount(1);
      await expect(
        myClassSection.getByText("まだ参加しているクラスはありません", {
          exact: true,
        })
      ).toBeVisible();
      await expect(
        myClassSection.getByText(
          "気になるテーマからクラスを探して参加してみよう。",
          { exact: true }
        )
      ).toBeVisible();
      await expect(
        myClassSection.getByText("自分でクラスを作ってみよう", { exact: false })
      ).toHaveCount(0);
      await expect(myClassSection.getByText("下のカテゴリーやランダム通話から", { exact: false })).toHaveCount(0);
      await expect(page.locator(".cm-my-class-empty-actions")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "ランダム通話へ", exact: true })).toHaveCount(0);
      // Free entitlements mock: hide create CTA until can_create_classes is true.
      await expect(myClassSection.getByRole("link", { name: "＋ 作成", exact: true })).toHaveCount(0);
      const myClassShortcut = page.locator("button.cm-home-my-class-shortcut");
      await expect(myClassShortcut).toBeVisible();
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const el = document.getElementById("cm-home-my-class");
            return el ? el.getBoundingClientRect().top : Number.NEGATIVE_INFINITY;
          })
        )
        .toBeGreaterThan(200);
      await myClassShortcut.click();
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const el = document.getElementById("cm-home-my-class");
            if (!el) return Number.POSITIVE_INFINITY;
            return Math.abs(el.getBoundingClientRect().top);
          })
        )
        .toBeLessThan(140);
      await expect(page).toHaveURL(/\/$/);
      await page.evaluate(() => window.scrollTo(0, 0));
      // Home-centric experiment: bottom nav hidden; avatar opens the account menu.
      await expect(page.locator(".cm-mobile-bottom-nav")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "メニューを開く", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "プロフィール編集", exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`home-${viewport.width}.png`), animations: "disabled" });
      await brand.click();
      await checkActions(page);
      await page.getByRole("link", { name: "すべて見る", exact: true }).click();
      await expect(page).toHaveURL(/\/class\/select$/);
      await checkActions(page);
      // Home via brand logo only — no duplicate 「ホームへ戻る」 on 探す.
      await expect(page.getByRole("button", { name: "ホームへ戻る", exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Classmate — ホームへ戻る" })).toBeVisible();
      await expect(page.locator("button.cm-select-filter-btn")).toBeVisible();
      await expect(page.locator(".cm-mobile-bottom-nav")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "探す", exact: true })).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "カテゴリー", exact: true })).toHaveCount(1);
      // 探す shows the full major catalog in a 2-column grid.
      await expect(page.locator(".cm-home-theme-grid-list .cm-home-theme-card")).toHaveCount(10);
      await expect(page.getByRole("button", { name: /学校・勉強/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /アイデンティティ・多様性/ })).toBeVisible();
      await expect(page.getByText("各テーマから通話またはチャットで始められます（最大5人）")).toHaveCount(0);
      await expect(page.getByText("テーマを決めずに、気軽に入れるクラス")).toHaveCount(0);
      await expect(page.locator(".cm-home-brand-visual-intro")).toHaveCount(0);
      await expect(page.getByText("¥480/月", { exact: false })).toHaveCount(0);
      await page.getByRole("button", { name: /趣味・エンタメ/ }).click();
      await expect(page.getByRole("heading", { name: "趣味・エンタメ", exact: true })).toBeVisible();
      await expect(
        page.getByText("このカテゴリーのテーマ課金は準備中です。参加・課金はできません。")
      ).toBeVisible();
      await expect(page.locator(".cm-select-subcat-row")).toHaveCount(4);
      await expect(page.getByText("準備中").first()).toBeVisible();
      await expect(
        page
          .getByRole("button", { name: "通話", exact: true })
          .or(page.getByRole("button", { name: "通話で始める", exact: true }))
          .first()
      ).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath(`select-${viewport.width}.png`), animations: "disabled" });
      await brand.click();
      await expect(page).toHaveURL(/\/$/);
      await checkActions(page);
    });
  });
}
