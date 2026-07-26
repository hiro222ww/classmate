import { describe, expect, it } from "vitest";
import {
  DEFAULT_BILLING_CATEGORY_FLAGS,
  categoryBillingDisabledMessage,
  isCategoryBillingEnabled,
  parseBillingFlag,
  parseSlotBillingEnabled,
  parseThemeBillingEnabled,
} from "./billingAvailability";

describe("billingAvailability flags", () => {
  it("uses category defaults when settings are missing", () => {
    expect(parseSlotBillingEnabled(null)).toBe(
      DEFAULT_BILLING_CATEGORY_FLAGS.slot_billing_enabled
    );
    expect(parseThemeBillingEnabled(null)).toBe(
      DEFAULT_BILLING_CATEGORY_FLAGS.theme_billing_enabled
    );
    expect(parseSlotBillingEnabled(null)).toBe(true);
    expect(parseThemeBillingEnabled(null)).toBe(false);
    expect(parseSlotBillingEnabled(undefined)).toBe(true);
    expect(parseThemeBillingEnabled(undefined)).toBe(false);
  });

  it("parses explicit enabled/disabled values", () => {
    expect(parseBillingFlag({ enabled: true }, false)).toBe(true);
    expect(parseBillingFlag({ enabled: false }, true)).toBe(false);
    expect(parseBillingFlag(true, false)).toBe(true);
    expect(parseThemeBillingEnabled({ enabled: true })).toBe(true);
    expect(parseSlotBillingEnabled({ enabled: false })).toBe(false);
  });

  it("gates categories independently", () => {
    const flags = {
      slot_billing_enabled: true,
      theme_billing_enabled: false,
    };
    expect(isCategoryBillingEnabled(flags, "slots")).toBe(true);
    expect(isCategoryBillingEnabled(flags, "topic_plan")).toBe(false);

    const bothOn = {
      slot_billing_enabled: true,
      theme_billing_enabled: true,
    };
    expect(isCategoryBillingEnabled(bothOn, "slots")).toBe(true);
    expect(isCategoryBillingEnabled(bothOn, "topic_plan")).toBe(true);

    const bothOff = {
      slot_billing_enabled: false,
      theme_billing_enabled: false,
    };
    expect(isCategoryBillingEnabled(bothOff, "slots")).toBe(false);
    expect(isCategoryBillingEnabled(bothOff, "topic_plan")).toBe(false);
  });

  it("returns category-specific disabled messages", () => {
    expect(categoryBillingDisabledMessage("slots")).toContain("スロット");
    expect(categoryBillingDisabledMessage("topic_plan")).toContain("テーマ");
  });
});
