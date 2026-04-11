import { Suspense } from "react";
import SelectClient from "./SelectClient";

export default function ClassSelectPage() {
  return (
    <Suspense fallback={<main style={{ padding: 16 }}>読み込み中...</main>}>
      <SelectClient />
    </Suspense>
  );
}