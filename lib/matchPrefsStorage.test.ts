import { describe, expect, it } from "vitest";
import {
  defaultMatchPrefs,
  resolveMatchPrefsWriteMode,
} from "./matchPrefsStorage";

describe("matchPrefsStorage", () => {
  it("returns default OFF prefs for unknown device", () => {
    expect(defaultMatchPrefs("device-abc")).toEqual({
      device_id: "device-abc",
      user_id: null,
      min_age: 0,
      max_age: 130,
    });
  });

  it("updates by user_id when prefs exist on another device", () => {
    const mode = resolveMatchPrefsWriteMode({
      deviceId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      existing: {
        device_id: "33333333-3333-4333-8333-333333333333",
        user_id: "22222222-2222-4222-8222-222222222222",
        min_age: 18,
        max_age: 25,
      },
    });

    expect(mode).toEqual({
      type: "user_update",
      userId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
