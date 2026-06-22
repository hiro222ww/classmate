import { describe, expect, it } from "vitest";
import {
  isValidDeviceUuid,
  isLegacyStoredDeviceId,
  isJoinAllowedDeviceId,
  tailDeviceId,
} from "./deviceIdValidation";
import { resolveMatchJoinUserMessage } from "./matchJoinUserMessage";

describe("deviceIdValidation", () => {
  it("accepts uuid v4", () => {
    expect(isValidDeviceUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects legacy timestamp ids", () => {
    expect(isValidDeviceUuid("1710000000000-abc123def456")).toBe(false);
    expect(isLegacyStoredDeviceId("1710000000000-abc123def456")).toBe(true);
  });

  it("allows dev E2E device ids for join", () => {
    expect(isJoinAllowedDeviceId("test-device-1")).toBe(true);
    expect(isJoinAllowedDeviceId("webrtc-test-device-2")).toBe(true);
    expect(isLegacyStoredDeviceId("test-device-1")).toBe(false);
  });

  it("tails device id safely", () => {
    expect(tailDeviceId("550e8400-e29b-41d4-a716-446655440000")).toBe("0000");
  });
});

describe("matchJoinUserMessage", () => {
  it("maps invalid device id", () => {
    expect(resolveMatchJoinUserMessage("invalid_deviceId")).toContain(
      "端末情報をリセット"
    );
  });
});
