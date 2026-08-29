import { Suspense } from "react";
import MineClient from "./MineClient";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

export default function ClassMinePage() {
  return (
    <ClientErrorBoundary label="class-mine">
      <Suspense fallback={<main style={{ padding: 16 }}>読み込み中...</main>}>
        <MineClient />
      </Suspense>
    </ClientErrorBoundary>
  );
}
