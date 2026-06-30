import { Suspense } from "react";
import AppSettingsClient from "./AppSettingsClient";

export default function AppSettingsPage() {
  return (
    <Suspense fallback={<p className="app-shell-muted">読み込み中…</p>}>
      <AppSettingsClient />
    </Suspense>
  );
}
