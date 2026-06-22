import type { ResolvedRequestIdentity } from "@/lib/requestIdentity";

export const BILLING_LINK_REQUIRED_MESSAGE =
  "購入内容を安全に保存するため、アカウント連携が必要です";

export function isAccountLinkedForBilling(identity: {
  isAnonymous: boolean;
  hasLinkedEmail: boolean;
}): boolean {
  return !identity.isAnonymous && identity.hasLinkedEmail;
}

export function billingLinkRequiredResponse() {
  return {
    ok: false as const,
    error: "account_link_required" as const,
    message: BILLING_LINK_REQUIRED_MESSAGE,
    redirectTo: "/settings" as const,
  };
}

export function assertBillingAccountLinked(
  identity: ResolvedRequestIdentity
):
  | { ok: true }
  | {
      ok: false;
      status: number;
      error: string;
      message: string;
      redirectTo: string;
    } {
  if (!identity.userId) {
    return {
      ok: false,
      status: 401,
      error: "auth_required",
      message: "認証が必要です。",
      redirectTo: "/login",
    };
  }

  if (!isAccountLinkedForBilling(identity)) {
    const required = billingLinkRequiredResponse();
    return {
      ok: false,
      status: 403,
      error: required.error,
      message: required.message,
      redirectTo: required.redirectTo,
    };
  }

  return { ok: true };
}
