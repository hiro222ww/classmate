// app/page.tsx
import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

export default function HomePage() {
  return (
    <main style={{ padding: "28px 20px", maxWidth: 960, margin: "0 auto" }}>
      <ClientErrorBoundary label="home">
        <Suspense fallback={<p style={{ margin: 0 }}>読み込み中...</p>}>
          <HomeClient />
        </Suspense>
      </ClientErrorBoundary>
    </main>
  );
}
