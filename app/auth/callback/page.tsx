import type { Metadata } from "next";
import { Suspense } from "react";
import AuthCallbackClient from "./AuthCallbackClient";
import { NOINDEX_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  title: "認証",
  robots: NOINDEX_ROBOTS,
};

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <p
          className="cm-classroom-scope cm-auth-root cm-home-loading-line"
          style={{ padding: 24 }}
        >
          ログイン処理中…
        </p>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
