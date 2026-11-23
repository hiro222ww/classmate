import { describe, expect, it } from "vitest";
import {
  formatJstDateTime,
  isoToJstWallInput,
  jstWallTimeToIso,
} from "@/lib/experience/time";

describe("experience time helpers", () => {
  it("converts JST wall time to UTC ISO without DST issues", () => {
    const iso = jstWallTimeToIso("2026-11-24T21:00");
    expect(iso).toBe("2026-11-24T12:00:00.000Z");
    expect(isoToJstWallInput(iso!)).toBe("2026-11-24T21:00");
    expect(formatJstDateTime(iso!)).toBe("2026/11/24 21:00");
  });

  it("rejects invalid wall strings", () => {
    expect(jstWallTimeToIso("")).toBeNull();
    expect(jstWallTimeToIso("not-a-date")).toBeNull();
  });
});
