import { describe, expect, it } from "vitest";
import {
  isRetryableSupabaseFailure,
  toUserFacingProfileSaveError,
  withSupabaseRetry,
  PROFILE_SAVE_NETWORK_USER_MESSAGE,
} from "@/lib/supabaseRetry";

describe("supabaseRetry", () => {
  it("detects supabase-style fetch failed messages", () => {
    expect(
      isRetryableSupabaseFailure({
        name: "TypeError",
        message: "TypeError: fetch failed",
      })
    ).toBe(true);
    expect(isRetryableSupabaseFailure("TypeError: fetch failed")).toBe(true);
  });

  it("maps low-level fetch errors to a user-facing message", () => {
    expect(toUserFacingProfileSaveError("TypeError: fetch failed")).toBe(
      PROFILE_SAVE_NETWORK_USER_MESSAGE
    );
    expect(
      toUserFacingProfileSaveError({
        message: "fetch failed",
      })
    ).toBe(PROFILE_SAVE_NETWORK_USER_MESSAGE);
  });

  it("keeps intentional validation-style messages", () => {
    expect(toUserFacingProfileSaveError("表示名を入力してください。")).toBe(
      "表示名を入力してください。"
    );
  });

  it("retries thrown network failures then succeeds", async () => {
    let attempts = 0;
    const result = await withSupabaseRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new TypeError("fetch failed");
        }
        return { ok: true };
      },
      { maxAttempts: 3, backoffMs: [1, 1] }
    );
    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(3);
  });

  it("retries retryable { error } results", async () => {
    let attempts = 0;
    const result = await withSupabaseRetry(
      async () => {
        attempts += 1;
        if (attempts < 2) {
          return { data: null, error: { message: "TypeError: fetch failed" } };
        }
        return { data: { id: 1 }, error: null };
      },
      { maxAttempts: 3, backoffMs: [1, 1] }
    );
    expect(result).toEqual({ data: { id: 1 }, error: null });
    expect(attempts).toBe(2);
  });
});
