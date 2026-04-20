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
  console.error("[admin/worlds] bad", { status, error, ...(extra ?? {}) });

  // デバッグ中は 200 で返して中身を見やすくする
  return NextResponse.json(
    { ok: false, error, ...(extra ?? {}), worlds: [] },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "").trim();
    const mode = String(body?.mode ?? "").trim();

    console.log("[admin/worlds] env", {
      hasAdminPassword: Boolean(ADMIN_PASSWORD),
      hasSupabaseUrl: Boolean(SUPABASE_URL),
      hasServiceRole: Boolean(SERVICE_ROLE),
      supabaseUrlHead: SUPABASE_URL ? SUPABASE_URL.slice(0, 32) : "",
      serviceRoleHead: SERVICE_ROLE ? SERVICE_ROLE.slice(0, 20) : "",
    });

    console.log("[admin/worlds] request", {
      mode,
      hasPassword: Boolean(password),
      passwordLength: password.length,
    });

    if (!ADMIN_PASSWORD) {
      return bad(500, "ADMIN_PASSWORD is not set", { where: "env_admin_password" });
    }
    if (!SUPABASE_URL) {
      return bad(500, "SUPABASE_URL is not set", { where: "env_supabase_url" });
    }
    if (!SERVICE_ROLE) {
      return bad(500, "SUPABASE_SERVICE_ROLE_KEY is not set", {
        where: "env_service_role",
      });
    }

    if (!password || password !== ADMIN_PASSWORD) {
      return bad(401, "invalid password", { where: "password_check" });
    }
    if (!mode) {
      return bad(400, "mode is required", { where: "mode_check" });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // ========= list =========
    if (mode === "list") {
      const { data, error } = await supabase
        .from("worlds")
        .select("world_key,title,description,is_sensitive,min_age,created_at")
        .order("created_at", { ascending: true });

      console.log("[admin/worlds] list result", {
        hasError: Boolean(error),
        errorMessage: error?.message ?? "",
        rowCount: data?.length ?? 0,
      });

      if (error) return bad(500, error.message, { where: "worlds_list" });
      return NextResponse.json({ ok: true, worlds: (data ?? []) as WorldRow[] });
    }

    // ========= create =========
    if (mode === "create") {
      const w = (body?.world ?? {}) as Partial<WorldRow>;
      const world_key = String(w.world_key ?? "").trim();
      const title = String(w.title ?? "").trim();
      if (!world_key) return bad(400, "world.world_key is required", { where: "worlds_create_key" });
      if (!title) return bad(400, "world.title is required", { where: "worlds_create_title" });

      const row: any = {
        world_key,
        title,
        description: typeof w.description === "string" ? w.description : "",
        is_sensitive: Boolean(w.is_sensitive),
        min_age: Number.isFinite(w.min_age) ? Number(w.min_age) : 0,
      };

      const { error } = await supabase.from("worlds").insert(row);
      if (error) return bad(500, error.message, { where: "worlds_create" });

      return NextResponse.json({ ok: true });
    }

    // ========= update =========
    if (mode === "update") {
      const world_key = String(body?.world_key ?? "").trim();
      const patch = (body?.patch ?? {}) as Partial<WorldRow>;
      if (!world_key) return bad(400, "world_key is required", { where: "worlds_update_key" });

      const updatePatch: any = {};
      if (typeof patch.title === "string") updatePatch.title = patch.title;
      if (typeof patch.description === "string") updatePatch.description = patch.description;
      if (typeof patch.is_sensitive === "boolean") updatePatch.is_sensitive = patch.is_sensitive;
      if (typeof patch.min_age === "number") updatePatch.min_age = patch.min_age;

      const { error } = await supabase
        .from("worlds")
        .update(updatePatch)
        .eq("world_key", world_key);

      if (error) return bad(500, error.message, { where: "worlds_update" });

      return NextResponse.json({ ok: true });
    }

    // ========= delete =========
    if (mode === "delete") {
      const world_key = String(body?.world_key ?? "").trim();
      if (!world_key) return bad(400, "world_key is required", { where: "worlds_delete_key" });

      const { count, error: cErr } = await supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("world_key", world_key);

      if (cErr) return bad(500, cErr.message, { where: "worlds_delete_classes_count" });
      if ((count ?? 0) > 0) {
        return bad(400, "world is used by classes; cannot delete", {
          where: "worlds_delete_world_in_use",
          code: "world_in_use",
          count,
        });
      }

      const { error: dErr } = await supabase
        .from("worlds")
        .delete()
        .eq("world_key", world_key);

      if (dErr) return bad(500, dErr.message, { where: "worlds_delete" });

      return NextResponse.json({ ok: true });
    }

    return bad(400, `unknown mode: ${mode}`, { where: "unknown_mode" });
  } catch (e: any) {
    console.error("[admin/worlds] fatal", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "admin worlds failed", where: "catch", worlds: [] },
      { status: 200 }
    );
  }
}