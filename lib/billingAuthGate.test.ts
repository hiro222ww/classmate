import { describe, expect, it } from "vitest";
import {
  assertBillingAccountLinked,
  billingLoginRequiredResponse,
  isAccountLinkedForBilling,
} from "@/lib/billingAuthGate";
import type { ResolvedRequestIdentity } from "@/lib/requestIdentity";

function identity(
  overrides: Partial<ResolvedRequestIdentity> = {}
): ResolvedRequestIdentity {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    deviceId: "22222222-2222-4222-8222-222222222222",
    isAnonymous: false,
    hasLinkedEmail: true,
    email: "user@example.com",
    accessToken: "token",
    authError: null,
    ...overrides,
  };
}

describe("billingAuthGate", () => {
  it("treats linked non-anonymous users as billable", () => {
    expect(
      isAccountLinkedForBilling({
        isAnonymous: false,
        hasLinkedEmail: false,
      })
    ).toBe(true);
  });

  it("blocks anonymous users from billing", () => {
    const gate = assertBillingAccountLinked(
      identity({ isAnonymous: true, hasLinkedEmail: false, email: null }),
      "/premium"
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.error).toBe("auth_required");
      expect(gate.redirectTo).toBe("/login?returnTo=%2Fpremium");
    }
  });

  it("allows non-anonymous users for billing (Google login)", () => {
    const gate = assertBillingAccountLinked(
      identity({ hasLinkedEmail: false, email: null }),
      "/premium"
    );
    expect(gate.ok).toBe(true);
  });

  it("requires auth user id for billing routes", () => {
    const gate = assertBillingAccountLinked(identity({ userId: "" }), "/premium");
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.error).toBe("auth_required");
      expect(gate.redirectTo).toBe("/login?returnTo=%2Fpremium");
    }
  });

  it("allows linked authenticated users", () => {
    expect(assertBillingAccountLinked(identity()).ok).toBe(true);
  });
});
