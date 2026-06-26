import { describe, expect, it } from "vitest";
import {
  formatAuthEmailError,
  isEmailAlreadyRegisteredError,
  isEmailRateLimitError,
} from "@/lib/authEmailErrors";

describe("authEmailErrors", () => {
  it("detects rate limit messages", () => {
    expect(isEmailRateLimitError("email rate limit exceeded")).toBe(true);
    expect(isEmailRateLimitError("over_email_send_rate_limit")).toBe(true);
    expect(isEmailRateLimitError("invalid email")).toBe(false);
  });

  it("detects already registered messages", () => {
    expect(isEmailAlreadyRegisteredError("User already registered")).toBe(true);
    expect(isEmailAlreadyRegisteredError("Email already exists")).toBe(true);
    expect(isEmailAlreadyRegisteredError("network error")).toBe(false);
  });

  it("formats rate limit for users", () => {
    expect(formatAuthEmailError("email rate limit exceeded")).toContain(
      "数分待って"
    );
  });
});
