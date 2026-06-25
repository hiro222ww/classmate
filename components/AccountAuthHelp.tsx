"use client";

import { HelpTip } from "@/components/HelpTip";

const ACCOUNT_LINK_HELP =
  "この端末で使っているプロフィール・プランに、メールアドレスを紐づけます。初めての利用でもログインは不要です。課金の前に連携が必要です。";

const LOGIN_HELP =
  "すでに別の端末（Safari / Chrome など）でメール連携済みの方が、同じアカウントに戻るときに使います。メールに届くリンクを開くと、この端末でも同じデータを復元できます。";

export function AccountLinkHelpTip() {
  return (
    <HelpTip label="アカウント連携について" content={ACCOUNT_LINK_HELP} maxWidth={300}>
      <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700 }}>
        連携とログインの違い
      </span>
    </HelpTip>
  );
}

export function LoginHelpTip() {
  return (
    <HelpTip label="ログインについて" content={LOGIN_HELP} maxWidth={300}>
      <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700 }}>
        ログインとは
      </span>
    </HelpTip>
  );
}
