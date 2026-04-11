// app/call/page.tsx
import { Suspense } from "react";
import CallClient from "./CallClient";

export default function CallPage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Suspense fallback={<p>読み込み中...</p>}>
        <CallClient />
      </Suspense>
    </main>
  );
}