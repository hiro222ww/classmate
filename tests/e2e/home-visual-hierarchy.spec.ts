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
  const voice = page.getByRole("button", { name: "通話で始める", exact: true });
  const chat = page.getByRole("button", { name: "チャットで始める", exact: true });
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
      expect((await brand.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(brand.locator("img")).toHaveCount(1);
      await expect(brand).toContainText("クラスメイト");
      await expect(page.locator(".cm-home-brand-visual-intro")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "テーマを選ぶ", exact: true })).toHaveCSS("border-top-width", "0px");
      await page.screenshot({ path: testInfo.outputPath(`home-${viewport.width}.png`), animations: "disabled" });
      await brand.click();
      await checkActions(page);
      await page.getByRole("link", { name: "テーマを選ぶ", exact: true }).click();
      await expect(page).toHaveURL(/\/class\/select$/);
      await checkActions(page);
      await expect(page.getByText("同年代と気軽に話そう", { exact: true })).toHaveCount(1);
      await expect(page.getByText("各テーマから通話またはチャットで始められます（最大5人）")).toHaveCount(0);
      await expect(page.getByText("テーマを決めずに、気軽に入れるクラス")).toHaveCount(0);
      await expect(page.getByText("準備中のテーマです。通話・チャットともに参加・購入できません")).toHaveCount(0);
      await expect(page.locator(".cm-home-brand-visual-intro")).toHaveCount(0);
      await expect(page.getByText("¥480/月", { exact: false }).first()).toBeVisible();
      await expect(page.locator(".cm-select-theme-card--teaser button").first()).toBeDisabled();
      await page.screenshot({ path: testInfo.outputPath(`select-${viewport.width}.png`), animations: "disabled" });
      await brand.click();
      await expect(page).toHaveURL(/\/$/);
      await checkActions(page);
    });
  });
}
