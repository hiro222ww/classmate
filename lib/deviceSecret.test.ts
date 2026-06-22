import { describe, expect, it } from "vitest";
import {
  createDeviceSecret,
  hashDeviceSecret,
  isValidDeviceSecret,
} from "./deviceSecret";

describe("deviceSecret", () => {
  it("creates and hashes secrets consistently", () => {
    const secret = createDeviceSecret();
    expect(isValidDeviceSecret(secret)).toBe(true);
    expect(hashDeviceSecret(secret)).toBe(hashDeviceSecret(secret));
  });

  it("rejects invalid secrets", () => {
    expect(isValidDeviceSecret("short")).toBe(false);
    expect(isValidDeviceSecret("")).toBe(false);
  });
});
