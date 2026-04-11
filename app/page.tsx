// app/page.tsx
import { Suspense } from "react";
import HomeClient from "./HomeClient";

export default function HomePage() {
  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
          classmate
        </h1>
      </header>

      <section style={{ marginTop: 18 }}>
        <Suspense fallback={<p>読み込み中...</p>}>
          <HomeClient />
        </Suspense>
      </section>
    </main>
  );
}