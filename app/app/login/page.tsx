import { Suspense } from "react";
import AppLoginClient from "./AppLoginClient";

export default function AppLoginPage() {
  return (
    <Suspense fallback={<p className="app-shell-muted">読み込み中…</p>}>
      <AppLoginClient />
    </Suspense>
  );
}
