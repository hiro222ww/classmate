import { Suspense } from "react";
import type { Metadata } from "next";
import {
  assertDevFixtureAllowed,
  DEV_FIXTURE_ROBOTS,
} from "@/lib/devFixtureGuard";
import ProfileChromeFixture from "./ProfileChromeFixture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dev profile chrome (local only)",
  robots: DEV_FIXTURE_ROBOTS,
};

/** Local visual QA only. No API / Auth / DB writes. */
export default function DevProfileChromePage() {
  assertDevFixtureAllowed();

  return (
    <Suspense fallback={<p style={{ padding: 16 }}>読み込み中…</p>}>
      <ProfileChromeFixture />
    </Suspense>
  );
}
