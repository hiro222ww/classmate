import { describe, expect, it, beforeEach } from "vitest";
import {
  MESSAGE_MAX_LENGTH,
  checkMessageRateLimit,
  resetMessageRateLimitsForTests,
  validateMessageText,
} from "./messageLimits";

describe("messageLimits", () => {
  beforeEach(() => {
    resetMessageRateLimitsForTests();
  });

  it("rejects empty and oversized text", () => {
    expect(validateMessageText("   ").ok).toBe(false);
    expect(validateMessageText("a".repeat(MESSAGE_MAX_LENGTH + 1)).ok).toBe(
      false
    );
    expect(validateMessageText("hello").ok).toBe(true);
  });

  it("rate limits consecutive sends", () => {
    expect(checkMessageRateLimit("k", 1000)).toBe(true);
    expect(checkMessageRateLimit("k", 1200)).toBe(false);
    expect(checkMessageRateLimit("k", 3000)).toBe(true);
  });
});
