export const BILLING_SUPPORT_EMAIL = "classmate.app.team@gmail.com";

export const BILLING_BETA_NOTICE =
  "β期間中は、仕様変更や不具合対応により、一部機能・課金状態・プロフィール情報の扱いが変更される場合があります。課金済み機能が利用できない不具合が発生した場合は、確認のうえ返金等の対応を行います。";

export const BILLING_PORTAL_LOGIN_TOOLTIP =
  "決済時のメールアドレスと、Stripe から届くワンタイムコードで Stripe の課金管理ページにログインできます。アプリにアクセスできない場合も、こちらから解約・支払い方法変更ができます。";

export const BILLING_PORTAL_LOGIN_LINK_LABEL = "Stripeで課金管理を開く";

export const BILLING_PORTAL_SECTION_TITLE = "課金管理・解約";

export const BILLING_TROUBLES_SUMMARY =
  "課金状態が表示されない・解約できない場合";

export const BILLING_CONTACT_HELP =
  "決済時のメールアドレスが分からない場合は、決済日・決済金額・カード下4桁・お名前・心当たりのあるメールアドレスを添えてお問い合わせください。";

export const BILLING_CONTACT_INFO_ITEMS = [
  "決済日",
  "決済金額",
  "カード下4桁",
  "お名前",
  "心当たりのあるメールアドレス",
] as const;

/** Stripe Dashboard で発行する Customer Portal ログイン URL（メール + OTP）。 */
export function getStripePortalLoginUrl(): string | null {
  const url = String(
    process.env.NEXT_PUBLIC_STRIPE_PORTAL_LOGIN_URL ?? ""
  ).trim();

  if (!url.startsWith("https://billing.stripe.com/")) {
    return null;
  }

  return url;
}
