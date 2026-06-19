import { test, expect } from "@playwright/test";
import { withDev } from "./helpers/config";
import {
  apiMatchJoin,
  apiSessionJoin,
  attachJoinListeners,
} from "./helpers/join";
import { skipWithoutBackend } from "./helpers/server";

async function openCallWithJoin(
  browser: import("@playwright/test").Browser,
  devKey: string,
  options: {
    grantMic?: boolean;
    fakeGetUserMedia?: "grant" | "deny";
  } = {}
) {
  test.skip(await skipWithoutBackend(), "backend unavailable");

  const deviceId = `test-device-${devKey}`;
  const join = await apiMatchJoin({ deviceId });
  expect(join.ok, join.error || "match-join failed").toBe(true);

  const contextOptions: Parameters<
    import("@playwright/test").Browser["newContext"]
  >[0] = {};
  if (options.grantMic && browser.browserType().name() === "chromium") {
    contextOptions.permissions = ["microphone"];
  }

  const context = await browser.newContext(contextOptions);

  if (options.fakeGetUserMedia === "deny") {
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      };
    });
  } else if (options.fakeGetUserMedia === "grant") {
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const track = {
          kind: "audio",
          enabled: true,
          readyState: "live",
          stop: () => {},
          getSettings: () => ({}),
        } as MediaStreamTrack;
        return {
          getTracks: () => [track],
          getAudioTracks: () => [track],
        } as MediaStream;
      };
    });
  }

  const page = await context.newPage();
  const logs = attachJoinListeners(page);

  await page.goto(
    withDev(
      `/call?classId=${encodeURIComponent(join.classId!)}&sessionId=${encodeURIComponent(join.sessionId!)}`,
      devKey
    )
  );

  await apiSessionJoin({
    deviceId,
    classId: join.classId!,
    sessionId: join.sessionId!,
  });

  return { context, page, logs, join };
}

test.describe("C/D. マイク拒否・許可", () => {
  test("マイク拒否: MicEntryGate と聞き専導線", async ({ browser }) => {
    const { context, page } = await openCallWithJoin(browser, "91", {
      fakeGetUserMedia: "deny",
    });

    await expect(page.getByLabel("通話参加の準備")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "聞き専で参加" })).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/500|Internal Server Error/);

    await context.close();
  });

  test("マイク拒否: 聞き専で参加すると gate が消える", async ({ browser }) => {
    const { context, page } = await openCallWithJoin(browser, "92", {
      fakeGetUserMedia: "deny",
    });

    await page.getByRole("button", { name: "聞き専で参加" }).click({
      timeout: 30_000,
    });

    await expect(page.getByLabel("通話参加の準備")).toBeHidden({
      timeout: 20_000,
    });
    await expect(page.getByText("聞き専").first()).toBeVisible();

    await context.close();
  });

  test("マイク許可: gate が消え 500 にならない", async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "GUM grant mock is verified on Chromium; WebKit needs real OS permission"
    );

    const { context, page } = await openCallWithJoin(browser, "93", {
      grantMic: true,
      fakeGetUserMedia: "grant",
    });

    await expect(page.getByLabel("通話参加の準備")).toBeHidden({
      timeout: 45_000,
    });

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/500|Internal Server Error/);
    expect(body).not.toContain("参加準備中");

    await context.close();
  });
});
