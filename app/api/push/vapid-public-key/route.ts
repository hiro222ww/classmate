import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();

  if (!publicKey) {
    return NextResponse.json(
      { ok: false, error: "vapid_not_configured" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, publicKey });
}
