import { test, expect } from "@playwright/test";
import { withDebug } from "./helpers/config";
import { readStoredDeviceId, seedLegacyDeviceId } from "./helpers/device";
import { isValidDeviceUuid } from "@/lib/deviceIdValidation";

test.describe("B. 旧deviceId状態", () => {
  test("legacy localStorage id は UUID に自動置換される", async ({ browser }) => {
    const context = await browser.newContext();
    await seedLegacyDeviceId(context, "1710000000-abc123");
    const page = await context.newPage();

    await page.goto(withDebug("/class/select"));

    await page.waitForTimeout(1500);

    const stored = await readStoredDeviceId(page);
    expect(stored).toBeTruthy();
    expect(isValidDeviceUuid(String(stored))).toBe(true);
    expect(stored).not.toBe("1710000000-abc123");

    await context.close();
  });
});
