import { describe, expect, it } from "vitest";
import {
  detectLineInAppBrowser,
  buildAndroidChromeIntentUrl,
} from "./lineInAppBrowser";

describe("lineInAppBrowser", () => {
  it("detects LINE UA only", () => {
    expect(
      detectLineInAppBrowser(
        "Mozilla/5.0 Line/12.0.0 Mobile Safari"
      ).isLine
    ).toBe(true);
    expect(
      detectLineInAppBrowser(
        "Mozilla/5.0 (iPhone) Instagram 300.0"
      ).isLine
    ).toBe(false);
  });

  it("builds android chrome intent url", () => {
    const intent = buildAndroidChromeIntentUrl(
      "https://example.com/invite?code=abc"
    );
    expect(intent).toContain("intent://example.com/invite?code=abc");
    expect(intent).toContain("package=com.android.chrome");
  });
});
