import { describe, expect, it } from "vitest";
import { isRetryableNetworkError } from "./retryableFetch";

describe("isRetryableNetworkError", () => {
  it("treats supabase-style TypeError: fetch failed as retryable", () => {
    expect(
      isRetryableNetworkError({
        name: "TypeError",
        message: "TypeError: fetch failed",
      })
    ).toBe(true);
    expect(
      isRetryableNetworkError({
        name: "Error",
        message: "TypeError: fetch failed",
      })
    ).toBe(true);
  });

  it("treats connect timeout details as retryable", () => {
    expect(
      isRetryableNetworkError({
        name: "Error",
        message: "Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)",
      })
    ).toBe(true);
  });

  it("does not treat intentional aborts as retryable", () => {
    expect(
      isRetryableNetworkError({
        name: "AbortError",
        message: "The user aborted a request.",
      })
    ).toBe(false);
  });
});
