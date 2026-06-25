import type { ResolvedRequestIdentity } from "@/lib/requestIdentity";
import { buildLoginUrl, LOGIN_REQUIRED_MESSAGE } from "@/lib/authAccount";

/** @deprecated use LOGIN_REQUIRED_MESSAGE */
export const BILLING_LINK_REQUIRED_MESSAGE = LOGIN_REQUIRED_MESSAGE;

export function isAccountLinkedForBilling(identity: {
  isAnonymous: boolean;
  hasLinkedEmail: boolean;
}): boolean {
  return !identity.isAnonymous && identity.hasLinkedEmail;
}

export function billingLoginRequiredResponse(returnTo = "/premium") {
  return {
    ok: false as const,
    error: "auth_required" as const,
    message: LOGIN_REQUIRED_MESSAGE,
    redirectTo: buildLoginUrl(returnTo),
  };
}

export function assertBillingAccountLinked(
  identity: ResolvedRequestIdentity,
  returnTo = "/premium"
):
  | { ok: true }
  | {
      ok: false;
      status: number;
      error: string;
      message: string;
      redirectTo: string;
    } {
  if (!identity.userId || !isAccountLinkedForBilling(identity)) {
    const required = billingLoginRequiredResponse(returnTo);
    return {
      ok: false,
      status: identity.userId ? 403 : 401,
      error: required.error,
      message: required.message,
      redirectTo: required.redirectTo,
    };
  }

  return { ok: true };
}
