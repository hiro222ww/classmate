// app/page.tsx
import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

export default function HomePage() {
  return (
    <main style={{ padding: "28px 20px", maxWidth: 960, margin: "0 auto" }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
          classmate
        </h1>
      </header>

      <section style={{ marginTop: 18 }}>
        <ClientErrorBoundary label="home">
          <Suspense fallback={<p>読み込み中...</p>}>
            <HomeClient />
          </Suspense>
        </ClientErrorBoundary>
      </section>
    </main>
  );
}