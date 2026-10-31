/**
 * Dual-user UI check for create gates (free vs entitled).
 * Mocks /api/user/entitlements; does not hit real billing/RPC.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts";
fs.mkdirSync(OUT, { recursive: true });

const user = {
  id: "00000000-0000-4000-8000-000000000456",
  aud: "authenticated",
  role: "authenticated",
  is_anonymous: true,
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-09-01T00:00:00Z",
};
const token = `${Buffer.from(
  JSON.stringify({ alg: "HS256", typ: "JWT" })
).toString("base64url")}.${Buffer.from(
  JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })
).toString("base64url")}.test`;

async function setupMocks(page, entitlements) {
  const loggedInUser = {
    ...user,
    is_anonymous: false,
    email: "mate@example.com",
  };
  const sessionPayload = {
    access_token: token,
    refresh_token: "local-test-only",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: loggedInUser,
  };

  await page.addInitScript(
    ({ session, storageKey }) => {
      localStorage.setItem(
        "classmate_device_id",
        "00000000-0000-4000-8000-000000000123"
      );
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    {
      session: sessionPayload,
      // Matches @supabase/ssr / gotrue-js key for http://127.0.0.1:54321
      storageKey: "sb-127-auth-token",
    }
  );

  // Local Supabase + any hosted URL
  await page.route(/127\.0\.0\.1:54321|supabase\.co/, async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.includes("/auth/v1/user")) {
      return route.fulfill({ json: loggedInUser });
    }
    if (
      u.pathname.includes("/auth/v1/token") ||
      u.pathname.includes("/auth/v1/session")
    ) {
      return route.fulfill({ json: sessionPayload });
    }
    return route.fulfill({ json: sessionPayload });
  });

  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const responses = {
      "/api/profile": {
        ok: true,
        profile: {
          device_id: "00000000-0000-4000-8000-000000000123",
          display_name: "めいと",
          declared_age: 25,
          declared_age_as_of: "2026-09-01",
          minimum_profile: true,
        },
      },
      "/api/auth/session": {
        ok: true,
        userId: loggedInUser.id,
        deviceId: "00000000-0000-4000-8000-000000000123",
        isAnonymous: false,
        hasLinkedEmail: true,
        email: "mate@example.com",
      },
      "/api/class/mine": { ok: true, classes: [] },
      "/api/me/current-class": { ok: true, currentClass: null },
      "/api/class/list": { ok: true, worlds: [], classes: [] },
      "/api/topics": { ok: true, topics: [] },
      "/api/admission/status": {
        ok: true,
        open: true,
        admissionWindowEnabled: false,
      },
      "/api/user/entitlements": entitlements,
      "/api/user/match-prefs": {
        ok: true,
        prefs: { min_age: 18, max_age: 120 },
      },
      "/api/theme-catalog": { ok: true, categories: [] },
    };
    return route.fulfill({ json: responses[pathname] ?? { ok: true } });
  });
}

async function checkPersona(label, entitlements) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupMocks(page, entitlements);

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const createOnHome = await page
    .locator("#cm-home-my-class")
    .getByRole("link", { name: "＋ 作成", exact: true })
    .count();
  const emptyCopy = (
    await page.locator("#cm-home-my-class .cm-empty-state-body").textContent()
  )?.trim();
  await page.screenshot({
    path: path.join(OUT, `create_ui_${label}_home.png`),
    fullPage: true,
  });

  await page.goto(BASE + "/class/create", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const formVisible = await page.locator("#cm-create-name").count();
  const deniedVisible = await page
    .getByText("現在のプランではクラスを作成できません", { exact: false })
    .count();
  const loginGateVisible = await page
    .getByText("クラスを作成するにはログインが必要です", { exact: false })
    .count();
  const sensitiveCount = await page
    .getByText("センシティブ", { exact: false })
    .count();
  const premiumCount = await page
    .getByText("プレミアム", { exact: false })
    .count();
  const minAgeInput = page.locator("#cm-create-min-age");
  const minAgeValue =
    formVisible > 0 ? await minAgeInput.inputValue() : null;
  const minAttr = formVisible > 0 ? await minAgeInput.getAttribute("min") : null;
  await page.screenshot({
    path: path.join(OUT, `create_ui_${label}_create.png`),
    fullPage: true,
  });

  await browser.close();
  return {
    label,
    createOnHome,
    emptyCopy,
    formVisible,
    deniedVisible,
    loginGateVisible,
    sensitiveCount,
    premiumCount,
    minAgeValue,
    minAttr,
  };
}

const free = await checkPersona("free", {
  ok: true,
  plan: "free",
  class_slots: 1,
  can_create_classes: false,
  topic_plan: 0,
});
const entitled = await checkPersona("entitled", {
  ok: true,
  plan: "slots_3",
  class_slots: 3,
  can_create_classes: true,
  topic_plan: 0,
});

const report = { free, entitled };
const freeBlocked =
  free.formVisible === 0 &&
  (free.deniedVisible >= 1 || free.loginGateVisible >= 1);
const ok =
  free.createOnHome === 0 &&
  freeBlocked &&
  free.emptyCopy?.includes("探して参加") &&
  entitled.createOnHome === 1 &&
  entitled.formVisible === 1 &&
  entitled.deniedVisible === 0 &&
  entitled.loginGateVisible === 0 &&
  entitled.emptyCopy?.includes("自分でクラスを作って") &&
  entitled.sensitiveCount === 0 &&
  entitled.premiumCount === 0 &&
  entitled.minAgeValue === "18" &&
  entitled.minAttr === "18";

fs.writeFileSync(
  path.join(OUT, "create_ui_gates_verify.json"),
  JSON.stringify({ ok, ...report }, null, 2)
);
console.log(JSON.stringify({ ok, ...report }, null, 2));
process.exit(ok ? 0 : 1);
