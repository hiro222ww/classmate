import { Suspense } from "react";
import type { Metadata } from "next";
import {
  assertDevFixtureAllowed,
  DEV_FIXTURE_ROBOTS,
} from "@/lib/devFixtureGuard";
import AuthChromeFixture from "./AuthChromeFixture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dev auth chrome (local only)",
  robots: DEV_FIXTURE_ROBOTS,
};

/** Local visual QA only. No OAuth / email / session writes. */
export default function DevAuthChromePage() {
  assertDevFixtureAllowed();

  return (
    <Suspense fallback={<p style={{ padding: 16 }}>読み込み中…</p>}>
      <AuthChromeFixture />
    </Suspense>
  );
}
