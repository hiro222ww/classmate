// app/api/admin/worlds/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function assertAdmin(req: Request) {
  const pass = req.headers.get("x-admin-passcode") || "";
  const expected = process.env.ADMIN_PASSCODE || "";
  return Boolean(expected) && pass === expected;
}

export async function GET(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("worlds")
    .select("world_key, title, description, is_sensitive, min_age")
    .order("world_key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ worlds: data ?? [] });
}
