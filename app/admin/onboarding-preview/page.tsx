import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/lib/adminAuth";
import { NOINDEX_ROBOTS } from "@/lib/seo";
import OnboardingPreviewClient from "./OnboardingPreviewClient";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: NOINDEX_ROBOTS,
  title: "初回登録プレビュー（管理者）",
};

export default async function AdminOnboardingPreviewPage() {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminToken(token)) {
    redirect("/admin/login?next=/admin/onboarding-preview");
  }

  return (
    <Suspense fallback={<main style={{ padding: 20 }}>読み込み中…</main>}>
      <OnboardingPreviewClient />
    </Suspense>
  );
}
