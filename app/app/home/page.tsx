import { Suspense } from "react";
import AppHomeClient from "./AppHomeClient";

export default function AppHomePage() {
  return (
    <Suspense fallback={<p className="app-shell-muted">読み込み中…</p>}>
      <AppHomeClient />
    </Suspense>
  );
}
