import { Suspense } from "react";
import type { Metadata } from "next";
import {
  assertDevFixtureAllowed,
  DEV_FIXTURE_ROBOTS,
} from "@/lib/devFixtureGuard";
import ConsentChromeFixture from "./ConsentChromeFixture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dev consent chrome (local only)",
  robots: DEV_FIXTURE_ROBOTS,
};

/** Local visual QA only. No consent API / DB writes. */
export default function DevConsentChromePage() {
  assertDevFixtureAllowed();

  return (
    <Suspense fallback={<p style={{ padding: 16 }}>読み込み中…</p>}>
      <ConsentChromeFixture />
    </Suspense>
  );
}
