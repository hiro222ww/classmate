import { describe, expect, it } from "vitest";
import {
  DEFAULT_BILLING_COPY,
  billingNoticeFromCopy,
  normalizeBillingCopy,
} from "@/lib/billingCopySettings";

describe("billingCopySettings", () => {
  it("falls back to defaults when empty", () => {
    const copy = normalizeBillingCopy(null);
    expect(copy.notice.text).toBe(DEFAULT_BILLING_COPY.notice.text);
    expect(copy.premium.topicPlanHelp).toBe(DEFAULT_BILLING_COPY.premium.topicPlanHelp);
  });

  it("merges legacy billing_notice into notice", () => {
    const copy = normalizeBillingCopy(null, {
      enabled: false,
      text: "カスタム注意文",
    });
    expect(copy.notice.enabled).toBe(false);
    expect(copy.notice.text).toBe("カスタム注意文");
  });

  it("syncs billing_notice from copy", () => {
    const copy = normalizeBillingCopy({
      notice: { enabled: true, label: "ラベル", text: "本文" },
    });
    expect(billingNoticeFromCopy(copy)).toEqual({
      enabled: true,
      text: "本文",
    });
  });
});
