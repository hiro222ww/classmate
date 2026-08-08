import { Suspense } from "react";
import type { Metadata } from "next";
import CallProdChromeFixture from "@/app/call/demo/prod-chrome/CallProdChromeFixture";
import {
  assertDevFixtureAllowed,
  DEV_FIXTURE_ROBOTS,
} from "@/lib/devFixtureGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dev call chrome (local only)",
  robots: DEV_FIXTURE_ROBOTS,
};

/**
 * Local visual QA only. Same CallRoomView chrome as production,
 * with ?scene= for presentational states.
 * - No admin auth bypass for real routes
 * - No WebRTC / mic acquire
 * - No production data writes
 * - Blocked in production builds via assertDevFixtureAllowed()
 */
export default function DevCallChromePage() {
  assertDevFixtureAllowed();

  return (
    <Suspense fallback={<p style={{ padding: 16 }}>読み込み中…</p>}>
      <CallProdChromeFixture />
    </Suspense>
  );
}
