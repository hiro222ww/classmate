import type { Metadata } from "next";
import { Suspense } from "react";
import UserLoginClient, { LoginRouteGuard } from "@/components/auth/UserLoginClient";
import { NOINDEX_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  title: "ログイン",
  robots: NOINDEX_ROBOTS,
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <p className="cm-classroom-scope cm-auth-root cm-home-loading-line" style={{ padding: 24 }}>
          読み込み中…
        </p>
      }
    >
      <LoginRouteGuard>
        <UserLoginClient />
      </LoginRouteGuard>
    </Suspense>
  );
}
