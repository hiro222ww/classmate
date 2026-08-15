import type { Metadata } from "next";
import { Suspense } from "react";
import ProfileClient from "./ProfileClient";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";
import { NOINDEX_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  title: "プロフィール",
  robots: NOINDEX_ROBOTS,
};

export default function ProfilePage() {
  return (
    <main
      className="cm-classroom-scope cm-profile-root"
      style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}
    >
      <ClientErrorBoundary label="profile">
        <Suspense fallback={<p className="cm-home-loading-line">読み込み中...</p>}>
          <ProfileClient />
        </Suspense>
      </ClientErrorBoundary>
    </main>
  );
}