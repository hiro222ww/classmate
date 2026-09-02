import { describe, expect, it } from "vitest";
import { validateMinProfileForm } from "@/components/onboarding/MinProfileOnboardingForm";
import { DECLARED_AGE_MIN } from "@/lib/profileClient";
import { adultOnlyUserMessage } from "@/lib/agePolicyRules";

describe("validateMinProfileForm", () => {
  it("accepts valid adult profile", () => {
    const result = validateMinProfileForm({
      displayName: " 太郎 ",
      age: "22",
      legalAgreed: true,
    });
    expect(result).toEqual({
      ok: true,
      values: { displayName: "太郎", declaredAge: 22 },
    });
  });

  it("rejects empty display name", () => {
    const result = validateMinProfileForm({
      displayName: "   ",
      age: "22",
      legalAgreed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("表示名");
  });

  it("rejects underage", () => {
    const result = validateMinProfileForm({
      displayName: "未成年",
      age: String(DECLARED_AGE_MIN - 1),
      legalAgreed: true,
    });
    expect(result).toEqual({ ok: false, error: adultOnlyUserMessage() });
  });

  it("rejects missing legal consent", () => {
    const result = validateMinProfileForm({
      displayName: "太郎",
      age: "22",
      legalAgreed: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("同意");
  });
});
