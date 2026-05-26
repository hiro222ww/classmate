import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "deprecated_portal_route",
    },
    { status: 410 }
  );
}