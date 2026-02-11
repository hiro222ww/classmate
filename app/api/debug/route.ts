// app/api/debug/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function tail(s: string) {
  if (!s) return "";
  return s.length <= 18 ? s : s.slice(-18);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    SUPABASE_URL_tail: tail(process.env.SUPABASE_URL || ""),
    NEXT_PUBLIC_SUPABASE_URL_tail: tail(process.env.NEXT_PUBLIC_SUPABASE_URL || ""),
    HAS_SERVICE_ROLE: Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
    ),
    HAS_ANON: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    ADMIN_PASSWORD_set: Boolean(process.env.ADMIN_PASSWORD),
  });
}
