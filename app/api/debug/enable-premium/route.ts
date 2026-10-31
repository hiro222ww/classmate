import { NextResponse } from "next/server";
import { isDevFixtureAllowed } from "@/lib/devFixtureGuard";

export async function POST() {
  if (!isDevFixtureAllowed()) {
    return NextResponse.json(
      { ok: false, error: "not_available" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "disabled",
      message: "Use /api/dev/set-entitlements in development only.",
    },
    { status: 410 }
  );
}
