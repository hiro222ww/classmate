import { describe, expect, it } from "vitest";
import { shouldSkipAuthBootstrapForPath } from "@/lib/adminChromePath";

describe("shouldSkipAuthBootstrapForPath", () => {
  it("matches only onboarding preview", () => {
    expect(shouldSkipAuthBootstrapForPath("/admin/onboarding-preview")).toBe(
      true
    );
    expect(shouldSkipAuthBootstrapForPath("/admin/onboarding-preview/")).toBe(
      true
    );
  });

  it("does not match other admin, demo, or product paths", () => {
    expect(shouldSkipAuthBootstrapForPath("/admin")).toBe(false);
    expect(shouldSkipAuthBootstrapForPath("/admin/rooms")).toBe(false);
    expect(shouldSkipAuthBootstrapForPath("/call/demo")).toBe(false);
    expect(shouldSkipAuthBootstrapForPath("/call/demo/prod-chrome")).toBe(
      false
    );
    expect(shouldSkipAuthBootstrapForPath("/")).toBe(false);
    expect(shouldSkipAuthBootstrapForPath("/onboarding")).toBe(false);
    expect(shouldSkipAuthBootstrapForPath("/call")).toBe(false);
    expect(shouldSkipAuthBootstrapForPath("/room")).toBe(false);
  });
});
