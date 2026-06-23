import { Suspense } from "react";
import SelectClient from "./SelectClient";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

export default function ClassSelectPage() {
  return (
    <ClientErrorBoundary label="class-select">
      <Suspense fallback={<main style={{ padding: 16 }}>読み込み中...</main>}>
        <SelectClient />
      </Suspense>
    </ClientErrorBoundary>
  );
}