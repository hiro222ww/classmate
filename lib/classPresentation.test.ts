import { describe, expect, it } from "vitest";
import {
  normalizeClassDisplayName,
  resolveClassManagementLabel,
  resolveClassTitle,
} from "./classPresentation";

describe("classPresentation", () => {
  it("prefers display_name over system name", () => {
    expect(
      resolveClassTitle({
        name: "クラス0078Q",
        display_name: "放課後の雑談部屋",
      })
    ).toBe("放課後の雑談部屋");
    expect(resolveClassTitle({ name: "クラス0078Q" })).toBe("クラス0078Q");
  });

  it("rejects blank or oversized display names", () => {
    expect(normalizeClassDisplayName("   ").ok).toBe(false);
    expect(normalizeClassDisplayName("あ".repeat(31)).ok).toBe(false);
    expect(normalizeClassDisplayName(" 放課後 ").ok).toBe(true);
  });

  it("extracts management serial from system name", () => {
    expect(
      resolveClassManagementLabel({ name: "クラス0078Q", classId: "x" })
    ).toBe("0078Q");
  });
});
