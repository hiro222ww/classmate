import { Suspense } from "react";
import UserLoginClient, { LoginRouteGuard } from "@/components/auth/UserLoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>読み込み中…</p>}>
      <LoginRouteGuard>
        <UserLoginClient />
      </LoginRouteGuard>
    </Suspense>
  );
}
