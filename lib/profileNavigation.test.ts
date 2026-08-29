import { describe, expect, it } from "vitest";
import {
  buildOnboardingPath,
  sanitizeReturnTo,
} from "@/lib/profileNavigation";

describe("buildOnboardingPath", () => {
  it("returns bare onboarding for home", () => {
    expect(buildOnboardingPath("/")).toBe("/onboarding");
    expect(buildOnboardingPath()).toBe("/onboarding");
  });

  it("preserves invite room next path", () => {
    const next =
      "/room?invite=1&autojoin=1&classId=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee&sessionId=ffffffff-1111-4222-8333-444444444444";
    const path = buildOnboardingPath(next);
    expect(path.startsWith("/onboarding?next=")).toBe(true);
    const encoded = path.slice("/onboarding?next=".length);
    expect(sanitizeReturnTo(decodeURIComponent(encoded))).toBe(next);
  });
});
