import { describe, expect, it } from "vitest";
import {
  applyAgeModeToMatchRange,
  checkProfileRegistrationAge,
  checkSelfAgeForJoin,
  getAgeFilterBounds,
  canPersistMinorsOrAgeModeChange,
  isProductionAgeLocked,
  parseMinorsEnabledValue,
  resolveMinorsEnabledFromSettings,
} from "@/lib/agePolicyRules";
import { buildLegalConsentPayload } from "@/lib/legalConsent";
import { scanContactRisk } from "@/lib/contentModeration";

describe("agePolicy production lock", () => {
  it("locks production admin persist when ALLOW_MINORS_EXPERIMENT is unset", () => {
    const prevNode = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_MINORS_EXPERIMENT;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_MINORS_EXPERIMENT;
    expect(isProductionAgeLocked()).toBe(true);
    expect(
      canPersistMinorsOrAgeModeChange({
        nextMinorsEnabled: true,
        nextAgeMode: "minor_separated_test",
      }).allowed
    ).toBe(false);
    process.env.NODE_ENV = prevNode;
    process.env.ALLOW_MINORS_EXPERIMENT = prevAllow;
  });

  it("blocks under-18 join in post_high_school_only", () => {
    expect(checkSelfAgeForJoin(17, "post_high_school_only").ok).toBe(false);
    expect(checkSelfAgeForJoin(18, "post_high_school_only").ok).toBe(true);
  });

  it("allows 17-year-old profile when minor_separated_test with guardian consent", () => {
    expect(
      checkProfileRegistrationAge({
        age: 17,
        mode: "minor_separated_test",
        guardianConsent: true,
      }).ok
    ).toBe(true);
    expect(
      checkProfileRegistrationAge({
        age: 17,
        mode: "minor_separated_test",
        guardianConsent: false,
      }).ok
    ).toBe(false);
  });

  it("rejects under-18 profile when minors disabled", () => {
    expect(
      checkProfileRegistrationAge({
        age: 17,
        mode: "post_high_school_only",
      }).ok
    ).toBe(false);
  });

  it("forces adult match range in post_high_school_only", () => {
    expect(
      applyAgeModeToMatchRange("post_high_school_only", 0, 25, 20)
    ).toEqual({ minAge: 18, maxAge: 25 });
  });

  it("uses 18+ slider bounds when minors disabled", () => {
    expect(getAgeFilterBounds("post_high_school_only", 20)).toEqual({
      sliderMin: 18,
      sliderMax: 60,
      defaultMin: 18,
      defaultMax: 25,
    });
  });

  it("parses minors_enabled from string and nested values", () => {
    expect(parseMinorsEnabledValue(true)).toBe(true);
    expect(parseMinorsEnabledValue(false)).toBe(false);
    expect(parseMinorsEnabledValue(null)).toBe(false);
    expect(parseMinorsEnabledValue(undefined)).toBe(false);
    expect(parseMinorsEnabledValue("true")).toBe(true);
    expect(parseMinorsEnabledValue("false")).toBe(false);
    expect(parseMinorsEnabledValue('"true"')).toBe(true);
    expect(resolveMinorsEnabledFromSettings({ minors_enabled: "true" })).toBe(
      true
    );
    expect(
      resolveMinorsEnabledFromSettings({ settings: { minors_enabled: true } })
    ).toBe(true);
    expect(resolveMinorsEnabledFromSettings(null)).toBe(false);
  });

  it("allows teen slider bounds when minors enabled and user is minor", () => {
    expect(getAgeFilterBounds("minor_separated_test", 16)).toEqual({
      sliderMin: 13,
      sliderMax: 17,
      defaultMin: 15,
      defaultMax: 17,
    });
  });
});

describe("legalConsent", () => {
  it("buildLegalConsentPayload sets terms_agreed_at", () => {
    const payload = buildLegalConsentPayload("2026-06-22T00:00:00.000Z");
    expect(payload.terms_agreed_at).toBe("2026-06-22T00:00:00.000Z");
    expect(payload.terms_version).toBeTruthy();
  });
});

describe("contentModeration", () => {
  it("detects contact exchange patterns", () => {
    const hits = scanContactRisk("LINEで連絡して。渋谷駅で待ち合わせ");
    expect(hits.some((h) => h.code === "line")).toBe(true);
    expect(hits.some((h) => h.code === "meetup_time")).toBe(true);
  });
});
