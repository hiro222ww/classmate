import { describe, expect, it } from "vitest";
import {
  formatAuthProviderError,
  isAuthProviderDisabledError,
} from "@/lib/authProviderErrors";

describe("authProviderErrors", () => {
  it("detects disabled provider errors", () => {
    expect(
      isAuthProviderDisabledError(
        '{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}'
      )
    ).toBe(true);
  });

  it("formats disabled provider errors in Japanese", () => {
    const message = formatAuthProviderError(
      '{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}'
    );
    expect(message).toContain("Google ログインがまだ有効");
    expect(message).toContain("Supabase");
  });
});
