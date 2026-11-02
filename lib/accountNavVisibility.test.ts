import { describe, expect, it } from "vitest";
import {
  isRoomOrCallPath,
  shouldHideAccountNav,
} from "./accountNavVisibility";

describe("accountNavVisibility", () => {
  it("hides sticky nav on waiting and call rooms", () => {
    expect(isRoomOrCallPath("/room")).toBe(true);
    expect(isRoomOrCallPath("/room?classId=x")).toBe(false);
    expect(isRoomOrCallPath("/call")).toBe(true);
    expect(isRoomOrCallPath("/call/demo")).toBe(true);
    expect(shouldHideAccountNav("/room")).toBe(true);
    expect(shouldHideAccountNav("/call")).toBe(true);
    expect(shouldHideAccountNav("/call/demo")).toBe(true);
    expect(shouldHideAccountNav("/dev/call-chrome")).toBe(true);
  });

  it("keeps sticky nav on home for login affordance", () => {
    // Home uses its own header; path "/" is in DASHBOARD_HEADER_PATHS.
    expect(shouldHideAccountNav("/")).toBe(true);
    expect(shouldHideAccountNav("/settings")).toBe(false);
    expect(shouldHideAccountNav("/premium")).toBe(false);
  });
});
