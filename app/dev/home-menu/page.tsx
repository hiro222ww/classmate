import { Suspense } from "react";
import type { Metadata } from "next";
import {
  assertDevFixtureAllowed,
  DEV_FIXTURE_ROBOTS,
} from "@/lib/devFixtureGuard";
import HomeMenuFixture from "./HomeMenuFixture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dev home menu sheet (local only)",
  robots: DEV_FIXTURE_ROBOTS,
};

/** Local visual QA only — verifies hamburger menu sheet hugs content. */
export default function DevHomeMenuPage() {
  assertDevFixtureAllowed();

  return (
    <Suspense fallback={<p style={{ padding: 16 }}>読み込み中…</p>}>
      <HomeMenuFixture />
    </Suspense>
  );
}
