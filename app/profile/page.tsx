import { Suspense } from "react";
import ProfileClient from "./ProfileClient";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

export default function ProfilePage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        プロフィール
      </h1>

      <ClientErrorBoundary label="profile">
        <Suspense fallback={<p>読み込み中...</p>}>
          <ProfileClient />
        </Suspense>
      </ClientErrorBoundary>
    </main>
  );
}