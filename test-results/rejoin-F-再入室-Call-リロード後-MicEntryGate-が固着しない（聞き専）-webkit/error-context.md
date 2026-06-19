# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rejoin.spec.ts >> F. 再入室 >> Call リロード後 MicEntryGate が固着しない（聞き専）
- Location: tests/e2e/rejoin.spec.ts:50:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - heading "classmate" [level=1] [ref=e6]
      - generic [ref=e7]:
        - link "プロフィール編集" [ref=e8]:
          - /url: /profile?returnTo=%2Fclass%2Fselect&dev=62
        - link "プランを見る" [ref=e9]:
          - /url: /premium?dev=62
        - link "お支払い・解約" [ref=e10]:
          - /url: /billing?dev=62
        - link "🧪 開発コンソール" [ref=e11]:
          - /url: /dev/console?dev=62
    - generic [ref=e12]:
      - generic [ref=e13]: DEV STATUS
      - generic [ref=e14]: "dev: 62"
      - generic [ref=e15]: "deviceId: test-device-62"
      - generic [ref=e16]: "profile.device_id: test-device-62"
      - generic [ref=e17]: "display_name: E2E-62"
      - generic [ref=e18]: "prefsLoaded: true"
      - generic [ref=e19]: "prefs: OFF(0-130)"
    - generic [ref=e20]:
      - heading "今のクラスに戻る" [level=2] [ref=e21]
      - paragraph [ref=e22]:
        - text: 所属中のクラスに戻る
        - button "今のクラスに戻るについて" [ref=e24] [cursor=pointer]: "?"
      - link "今所属しているクラスを見る" [ref=e25]:
        - /url: /?dev=62
    - generic [ref=e26]:
      - generic [ref=e27]: "クラス枠: 25"
      - generic [ref=e28]: 入校受付中！
      - generic [ref=e29]: "テーマプラン: 無料（¥0/月）"
      - button "再読み込み" [ref=e30] [cursor=pointer]
    - generic [ref=e31]:
      - generic [ref=e32]:
        - generic [ref=e33]:
          - strong [ref=e34]: 年齢絞り込み
          - button "年齢絞り込みについて" [ref=e35] [cursor=pointer]: "?"
        - group "年齢絞り込み" [ref=e36]:
          - button "OFF" [ref=e37] [cursor=pointer]
          - button "ON" [ref=e38] [cursor=pointer]
      - paragraph [ref=e39]: 年齢では絞り込みません
    - generic [ref=e40]:
      - generic [ref=e41]:
        - generic [ref=e42]:
          - strong [ref=e43]: 新しく参加する
          - generic [ref=e44]: 初めて入る・別のクラスを探す場合はこちらです。
        - button "今すぐ入る" [ref=e45] [cursor=pointer]
      - button "世界観/テーマを選ぶ" [ref=e46] [cursor=pointer]
    - generic [ref=e48]:
      - generic [ref=e50]: DEV
      - textbox "ADMIN_PASSWORD" [ref=e51]
      - button "開発モード解除" [ref=e52] [cursor=pointer]
  - contentinfo [ref=e53]:
    - generic [ref=e54]:
      - link "About" [ref=e55]:
        - /url: /about
      - link "Terms" [ref=e56]:
        - /url: /terms
      - link "Legal" [ref=e57]:
        - /url: /legal/commercial-disclosure
    - generic [ref=e58]: © 2026 classmate
  - button "Open Next.js Dev Tools" [ref=e64] [cursor=pointer]:
    - img [ref=e65]
  - alert [ref=e70]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { withDev } from "./helpers/config";
  3  | import {
  4  |   clickFirstEnterButton,
  5  |   waitForEnabledEnterButton,
  6  | } from "./helpers/join";
  7  | import { skipWithoutBackend } from "./helpers/server";
  8  | 
  9  | test.describe("F. 再入室", () => {
  10 |   test.setTimeout(120_000);
  11 |   test("Room 入室後リロードで sessionId required にならない", async ({
  12 |     browser,
  13 |   }) => {
  14 |     test.skip(await skipWithoutBackend(), "backend unavailable");
  15 | 
  16 |     const context = await browser.newContext();
  17 |     const page = await context.newPage();
  18 | 
  19 |     await page.goto(withDev("/class/select", "61"));
  20 |     await waitForEnabledEnterButton(page);
  21 |     await Promise.all([
  22 |       page.waitForURL(/\/room/, { timeout: 60_000 }),
  23 |       clickFirstEnterButton(page),
  24 |     ]);
  25 | 
  26 |     await page.waitForFunction(
  27 |       () =>
  28 |         document.body?.innerText &&
  29 |         !document.body.innerText.includes("sessionId required"),
  30 |       undefined,
  31 |       { timeout: 30_000 }
  32 |     );
  33 | 
  34 |     await page.reload({ waitUntil: "networkidle" });
  35 | 
  36 |     await page.waitForFunction(
  37 |       () =>
  38 |         document.body?.innerText &&
  39 |         !document.body.innerText.includes("sessionId required"),
  40 |       undefined,
  41 |       { timeout: 30_000 }
  42 |     );
  43 | 
  44 |     const body = await page.locator("body").innerText();
  45 |     expect(body).not.toMatch(/500|Internal Server Error/);
  46 | 
  47 |     await context.close();
  48 |   });
  49 | 
  50 |   test("Call リロード後 MicEntryGate が固着しない（聞き専）", async ({
  51 |     browser,
  52 |   }) => {
  53 |     test.skip(await skipWithoutBackend(), "backend unavailable");
  54 | 
  55 |     const context = await browser.newContext();
  56 |     const page = await context.newPage();
  57 | 
  58 |     await page.goto(withDev("/class/select", "62"));
  59 |     await waitForEnabledEnterButton(page);
  60 |     await Promise.all([
> 61 |       page.waitForURL(/\/room/, { timeout: 60_000 }),
     |            ^ TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
  62 |       clickFirstEnterButton(page),
  63 |     ]);
  64 | 
  65 |     const roomUrl = page.url();
  66 |     const callUrl = roomUrl.replace("/room", "/call");
  67 |     await page.goto(callUrl);
  68 | 
  69 |     await page.getByRole("button", { name: "聞き専で参加" }).click({
  70 |       timeout: 30_000,
  71 |     });
  72 |     await expect(page.getByLabel("通話参加の準備")).toBeHidden({
  73 |       timeout: 20_000,
  74 |     });
  75 | 
  76 |     await page.reload({ waitUntil: "networkidle" });
  77 | 
  78 |     await page.getByRole("button", { name: "聞き専で参加" }).click({
  79 |       timeout: 30_000,
  80 |     }).catch(() => {});
  81 | 
  82 |     const body = await page.locator("body").innerText();
  83 |     expect(body).not.toMatch(/500|Internal Server Error/);
  84 | 
  85 |     await context.close();
  86 |   });
  87 | });
  88 | 
```