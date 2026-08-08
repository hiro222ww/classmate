import { Suspense } from "react";
import type { Metadata } from "next";
import {
  assertDevFixtureAllowed,
  DEV_FIXTURE_ROBOTS,
} from "@/lib/devFixtureGuard";
import InviteChromeFixture from "./InviteChromeFixture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dev invite chrome (local only)",
  robots: DEV_FIXTURE_ROBOTS,
};

/** Local visual QA only. No invite API / Auth / DB writes. */
export default function DevInviteChromePage() {
  assertDevFixtureAllowed();

  return (
    <Suspense fallback={<p style={{ padding: 16 }}>読み込み中…</p>}>
      <InviteChromeFixture />
    </Suspense>
  );
}
