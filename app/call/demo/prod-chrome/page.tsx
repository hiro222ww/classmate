import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/lib/adminAuth";
import CallProdChromeFixture from "./CallProdChromeFixture";

export const dynamic = "force-dynamic";

/**
 * Admin-only fixture: renders the same CallRoomView CallClient uses,
 * with static production-shaped props (no WebRTC / session).
 * Used for visual comparison against /call/demo.
 * Optional ?scene= for presentational states (prep, connecting, etc.).
 */
export default async function CallProdChromePage() {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminToken(token)) {
    redirect("/admin/login?next=/call/demo/prod-chrome");
  }
  return (
    <Suspense fallback={<p style={{ padding: 16 }}>読み込み中…</p>}>
      <CallProdChromeFixture />
    </Suspense>
  );
}
