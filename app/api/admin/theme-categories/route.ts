import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminActorFromRequest, writeAdminAuditLog } from "@/lib/adminAuditLog";
import {
  loadThemeCatalogDtos,
  replaceThemeCatalog,
  updateThemeMajorCategory,
} from "@/lib/themeCatalogStore";
import type { ThemeMajorCategoryDto } from "@/lib/themeCatalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bad(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

function ok(body: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...body });
}

/**
 * Admin theme category catalog.
 * Modes: list | replace | update_major
 * Does not mutate topics billing fields / Stripe prices.
 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  const mode = String(body?.mode ?? "list").trim();
  const actor = adminActorFromRequest(req);

  try {
    if (mode === "list") {
      const loaded = await loadThemeCatalogDtos({ includeHidden: true });
      return ok({
        majors: loaded.majors,
        source: loaded.source,
      });
    }

    if (mode === "replace") {
      const majors = Array.isArray(body?.majors)
        ? (body.majors as ThemeMajorCategoryDto[])
        : null;
      if (!majors) return bad(400, "majors_required");

      const saved = await replaceThemeCatalog(majors);
      await writeAdminAuditLog({
        actor,
        action: "theme_categories.replace",
        target: "theme_catalog",
        after: { count: saved.majors.length },
      });
      return ok({ majors: saved.majors, source: "database" });
    }

    if (mode === "update_major") {
      const id = String(body?.id ?? "").trim();
      if (!id) return bad(400, "id_required");
      const patch = {
        id,
        ...(body?.patch && typeof body.patch === "object" ? body.patch : {}),
      } as Partial<ThemeMajorCategoryDto> & { id: string };

      const updated = await updateThemeMajorCategory(patch);
      await writeAdminAuditLog({
        actor,
        action: "theme_categories.update_major",
        target: id,
        after: {
          status: updated.status,
          featuredOnHome: updated.featuredOnHome,
        },
      });
      return ok({ major: updated });
    }

    return bad(400, "invalid_mode");
  } catch (e: any) {
    const message = String(e?.message ?? e ?? "request_failed");
    if (message === "featured_home_limit_exceeded") {
      return bad(400, message);
    }
    if (message === "catalog_table_unavailable") {
      return bad(503, message, {
        detail:
          "theme_major_categories テーブルが未適用です。開発DBにマイグレーションを適用してください。",
      });
    }
    if (message === "supabase_not_configured") {
      return bad(503, message);
    }
    console.error("[admin/theme-categories]", e);
    return bad(500, "server_error", { detail: message });
  }
}
