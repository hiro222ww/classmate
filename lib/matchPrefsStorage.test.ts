import { describe, expect, it } from "vitest";
import { defaultMatchPrefs } from "./matchPrefsStorage";

describe("matchPrefsStorage", () => {
  it("returns default OFF prefs for unknown device", () => {
    expect(defaultMatchPrefs("device-abc")).toEqual({
      device_id: "device-abc",
      min_age: 0,
      max_age: 130,
    });
  });
});
