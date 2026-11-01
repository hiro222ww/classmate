import { Suspense } from "react";
import MineRedirectClient from "./MineRedirectClient";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

/**
 * Legacy mine page — redirects to home `#cm-home-my-class`.
 * API `/api/class/mine` is unchanged.
 */
export default function ClassMinePage() {
  return (
    <ClientErrorBoundary label="class-mine-redirect">
      <Suspense fallback={<main style={{ padding: 16 }}>読み込み中...</main>}>
        <MineRedirectClient />
      </Suspense>
    </ClientErrorBoundary>
  );
}
