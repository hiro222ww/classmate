// app/call/page.tsx
import { Suspense } from "react";
import CallClient from "./CallClient";

export default function CallPage() {
  return (
    <Suspense fallback={<p>読み込み中...</p>}>
      <CallClient />
    </Suspense>
  );
}
