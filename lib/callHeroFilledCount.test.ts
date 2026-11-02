import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("call hero filled count", () => {
  it("derives filled from visibleMembers (in-call strip), not full roster", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/CallClient.tsx"),
      "utf8"
    );
    expect(source).toContain("const filled = visibleMembers.length;");
    expect(source).not.toMatch(/const filled = members\.length/);
  });
});
