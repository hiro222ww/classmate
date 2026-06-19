import { test, expect } from "@playwright/test";
import { apiMatchJoin } from "./helpers/join";
import { skipWithoutBackend } from "./helpers/server";

test.describe("E. 複数ユーザー同時入校", () => {
  test.setTimeout(60_000);

  test("3 device 同時 match-join API（dev 51-53）", async () => {
    test.skip(await skipWithoutBackend(), "backend unavailable");

    const devKeys = ["51", "52", "53"];
    const results = await Promise.all(
      devKeys.map(async (devKey) => {
        const deviceId = `test-device-${devKey}`;
        const join = await apiMatchJoin({ deviceId });
        return { devKey, ...join };
      })
    );

    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBeGreaterThanOrEqual(2);

    for (const row of results) {
      if (!row.ok) {
        expect(row.error).not.toBe("invalid_deviceId");
        expect(row.status).not.toBe(500);
      }
    }

    const classIds = new Set(results.filter((r) => r.ok).map((r) => r.classId));
    expect(classIds.size).toBeGreaterThanOrEqual(1);
  });
});
