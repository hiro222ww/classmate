import { NextResponse } from "next/server";
import { getAdmissionStatus } from "@/lib/admissionWindow";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getAdmissionStatus();
    return NextResponse.json(status);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: "admission_lookup_failed",
        detail: message,
      },
      { status: 500 }
    );
  }
}
