import { Suspense } from "react";
import AuthCallbackClient from "./AuthCallbackClient";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>ログイン処理中…</p>}>
      <AuthCallbackClient />
    </Suspense>
  );
}
