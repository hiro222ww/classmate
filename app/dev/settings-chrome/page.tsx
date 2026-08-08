import { Suspense } from "react";
import type { Metadata } from "next";
import {
  assertDevFixtureAllowed,
  DEV_FIXTURE_ROBOTS,
} from "@/lib/devFixtureGuard";
import SettingsChromeFixture from "./SettingsChromeFixture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dev settings chrome (local only)",
  robots: DEV_FIXTURE_ROBOTS,
};

/** Local visual QA only. No Auth / notification / API writes. */
export default function DevSettingsChromePage() {
  assertDevFixtureAllowed();

  return (
    <Suspense fallback={<p style={{ padding: 16 }}>読み込み中…</p>}>
      <SettingsChromeFixture />
    </Suspense>
  );
}
