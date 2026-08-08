import { describe, expect, it } from "vitest";
import { isDevFixtureAllowed } from "./devFixtureGuard";

describe("isDevFixtureAllowed", () => {
  it("allows non-production development", () => {
    expect(
      isDevFixtureAllowed({ NODE_ENV: "development" })
    ).toBe(true);
  });

  it("blocks production NODE_ENV", () => {
    expect(isDevFixtureAllowed({ NODE_ENV: "production" })).toBe(false);
  });

  it("blocks VERCEL_ENV production", () => {
    expect(
      isDevFixtureAllowed({
        NODE_ENV: "development",
        VERCEL_ENV: "production",
      })
    ).toBe(false);
  });

  it("blocks when ALLOW_DEV_FIXTURES=0", () => {
    expect(
      isDevFixtureAllowed({
        NODE_ENV: "development",
        ALLOW_DEV_FIXTURES: "0",
      })
    ).toBe(false);
  });
});
