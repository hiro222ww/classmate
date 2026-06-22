import { describe, expect, it } from "vitest";
import {
  assertBillingAccountLinked,
  BILLING_LINK_REQUIRED_MESSAGE,
  isAccountLinkedForBilling,
} from "./billingAuthGate";

describe("billingAuthGate", () => {
  it("requires linked non-anonymous account for billing", () => {
    expect(
      isAccountLinkedForBilling({ isAnonymous: true, hasLinkedEmail: false })
    ).toBe(false);
    expect(
      isAccountLinkedForBilling({ isAnonymous: false, hasLinkedEmail: true })
    ).toBe(true);
  });

  it("blocks checkout without linked account", () => {
    const result = assertBillingAccountLinked({
      userId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
      isAnonymous: true,
      hasLinkedEmail: false,
      email: null,
      accessToken: "token",
      authError: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("account_link_required");
      expect(result.message).toBe(BILLING_LINK_REQUIRED_MESSAGE);
      expect(result.redirectTo).toBe("/settings");
    }
  });
});
