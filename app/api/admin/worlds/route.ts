// app/api/admin/worlds/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  "";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

type WorldRow = {
  world_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
  created_at?: string;
};

function bad(status: number, error: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

export async function POST(req: Request) {
  try {
    if (!ADMIN_PASSWORD) return bad(500, "ADMIN_PASSWORD is not set");
    if (!SUPABASE_URL) return bad(500, "SUPABASE_URL is not set");
    if (!SERVICE_ROLE) return bad(500, "SUPABASE_SERVICE_ROLE_KEY is not set");

    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "");
    const mode = String(body?.mode ?? "");

    if (!password || password !== ADMIN_PASSWORD) return bad(401, "invalid password");
    if (!mode) return bad(400, "mode is required");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // ========= list =========
    if (mode === "list") {
      const { data, error } = await supabase
        .from("worlds")
        .select("world_key,title,description,is_sensitive,min_age,created_at")
        .order("created_at", { ascending: true });

      if (error) return bad(500, error.message);
      return NextResponse.json({ ok: true, worlds: (data ?? []) as WorldRow[] });
    }

    // ========= create =========
    if (mode === "create") {
      const w = (body?.world ?? {}) as Partial<WorldRow>;
      const world_key = String(w.world_key ?? "").trim();
      const title = String(w.title ?? "").trim();
      if (!world_key) return bad(400, "world.world_key is required");
      if (!title) return bad(400, "world.title is required");

      const row: any = {
        world_key,
        title,
        description: typeof w.description === "string" ? w.description : "",
        is_sensitive: Boolean(w.is_sensitive),
        min_age: Number.isFinite(w.min_age) ? Number(w.min_age) : 0,
      };

      const { error } = await supabase.from("worlds").insert(row);
      if (error) return bad(500, error.message);

      return NextResponse.json({ ok: true });
    }

    // ========= update =========
    if (mode === "update") {
      const world_key = String(body?.world_key ?? "").trim();
      const patch = (body?.patch ?? {}) as Partial<WorldRow>;
      if (!world_key) return bad(400, "world_key is required");

      const updatePatch: any = {};
      if (typeof patch.title === "string") updatePatch.title = patch.title;
      if (typeof patch.description === "string") updatePatch.description = patch.description;
      if (typeof patch.is_sensitive === "boolean") updatePatch.is_sensitive = patch.is_sensitive;
      if (typeof patch.min_age === "number") updatePatch.min_age = patch.min_age;

      const { error } = await supabase.from("worlds").update(updatePatch).eq("world_key", world_key);
      if (error) return bad(500, error.message);

      return NextResponse.json({ ok: true });
    }

    // ========= delete (hard delete) =========
    // ルール:
    // - classes が参照してたら削除不可（事故防止）
    if (mode === "delete") {
      const world_key = String(body?.world_key ?? "").trim();
      if (!world_key) return bad(400, "world_key is required");

      // 1) classes参照チェック
      const { count, error: cErr } = await supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("world_key", world_key);

      if (cErr) return bad(500, cErr.message);
      if ((count ?? 0) > 0) {
        return bad(400, "world is used by classes; cannot delete", { code: "world_in_use", count });
      }

      // 2) delete
      const { error: dErr } = await supabase.from("worlds").delete().eq("world_key", world_key);
      if (dErr) return bad(500, dErr.message);

      return NextResponse.json({ ok: true });
    }

    return bad(400, `unknown mode: ${mode}`);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "admin worlds failed" },
      { status: 500 }
    );
  }
}
