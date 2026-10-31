import { NextResponse } from "next/server";
import { loadThemeCatalogDtos } from "@/lib/themeCatalogStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public catalog for home / 探す. Hidden majors omitted. */
export async function GET() {
  const loaded = await loadThemeCatalogDtos({ includeHidden: false });
  return NextResponse.json({
    ok: true,
    source: loaded.source,
    majors: loaded.majors,
  });
}
