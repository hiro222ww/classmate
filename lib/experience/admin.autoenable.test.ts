import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("experience admin auto-enables feature for schedules", () => {
  it("turns feature on when creating or restoring a scheduled event", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/experience/admin.ts"),
      "utf8"
    );
    expect(src).toMatch(/Creating a schedule implies the home card should be visible/);
    expect(src).toMatch(/setExperienceFeatureEnabled\(true\)/);
    expect(src).toMatch(/event\.status === "scheduled"/);
  });
});
