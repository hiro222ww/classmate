import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardrail: class-promote CTA must sit below the mute/share/exit dock so
 * negative-margin stacking cannot cover 退出 (seen on experience rooms).
 */
describe("call promote layout vs dock", () => {
  it("renders class-promote slot after the call dock in CallRoomView", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/CallRoomView.tsx"),
      "utf8"
    );
    const dockIdx = source.indexOf('className="cm-call-dock"');
    const promoteIdx = source.indexOf("cm-call-class-promote-slot");
    expect(dockIdx).toBeGreaterThan(-1);
    expect(promoteIdx).toBeGreaterThan(-1);
    expect(promoteIdx).toBeGreaterThan(dockIdx);
  });

  it("does not pull the promote slot upward with a large negative margin", () => {
    const css = readFileSync(
      join(process.cwd(), "app/classroomTheme.css"),
      "utf8"
    );
    expect(css).not.toMatch(
      /\.cm-call-class-promote-slot\s*\{[^}]*margin:\s*-40px/
    );
  });
});
