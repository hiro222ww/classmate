import { Suspense } from "react";
import UserLoginClient from "@/components/auth/UserLoginClient";

export default function AppLoginPage() {
  return (
    <Suspense fallback={<p className="app-shell-muted">読み込み中…</p>}>
      <UserLoginClient />
    </Suspense>
  );
}
