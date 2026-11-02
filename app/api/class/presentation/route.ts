import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveApiActor } from "@/lib/actorIdentity";
import { isClassPresentationEditSupported } from "@/lib/classEditSupport";
import {
  normalizeClassDisplayName,
  resolveClassManagementLabel,
  resolveClassTitle,
} from "@/lib/classPresentation";
import { isValidUuid } from "@/lib/userIdentity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeClassId(value: unknown): string {
  const s = String(value ?? "").trim();
  return isValidUuid(s) ? s : "";
}

/** GET — current presentation + whether member edit is available. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const classId = normalizeClassId(
      searchParams.get("classId") ?? searchParams.get("class_id")
    );
    const deviceId = String(
      searchParams.get("deviceId") ?? searchParams.get("device_id") ?? ""
    ).trim();

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "invalid_classId" },
        { status: 400 }
      );
    }

    const supported = await isClassPresentationEditSupported(supabaseAdmin);
    if (!supported) {
      return NextResponse.json({
        ok: true,
        editSupported: false,
        classId,
        name: null,
        displayName: null,
        title: null,
        coverPath: null,
        managementLabel: null,
        canEdit: false,
      });
    }

    const { data: classRow, error } = await supabaseAdmin
      .from("classes")
      .select("id, name, display_name, cover_path")
      .eq("id", classId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "class_lookup_failed", detail: error.message },
        { status: 500 }
      );
    }
    if (!classRow) {
      return NextResponse.json(
        { ok: false, error: "class_not_found" },
        { status: 404 }
      );
    }

    let canEdit = false;
    if (deviceId) {
      const actor = await resolveApiActor({ req, deviceId });
      if (actor.ok) {
        const { data: membership } = await supabaseAdmin
          .from("class_memberships")
          .select("device_id")
          .eq("class_id", classId)
          .eq("device_id", actor.actor.deviceId)
          .maybeSingle();
        canEdit = Boolean(membership);
      }
    }

    const name = String(classRow.name ?? "").trim() || null;
    const displayName = String(classRow.display_name ?? "").trim() || null;

    return NextResponse.json({
      ok: true,
      editSupported: true,
      classId,
      name,
      displayName,
      title: resolveClassTitle({ name, display_name: displayName }),
      coverPath: String(classRow.cover_path ?? "").trim() || null,
      managementLabel: resolveClassManagementLabel({
        name,
        classId,
      }),
      canEdit,
    });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "server_error", detail },
      { status: 500 }
    );
  }
}

type PatchBody = {
  classId?: unknown;
  class_id?: unknown;
  deviceId?: unknown;
  device_id?: unknown;
  displayName?: unknown;
  display_name?: unknown;
  coverPath?: unknown;
  cover_path?: unknown;
  clearCover?: unknown;
  clear_cover?: unknown;
};

/** PATCH — member-only update of display_name / cover_path. */
export async function PATCH(req: Request) {
  try {
    const supported = await isClassPresentationEditSupported(supabaseAdmin);
    if (!supported) {
      return NextResponse.json(
        { ok: false, error: "feature_not_migrated" },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const classId = normalizeClassId(body.classId ?? body.class_id);
    const deviceId = String(body.deviceId ?? body.device_id ?? "").trim();
    const clearCover =
      body.clearCover === true || body.clear_cover === true;

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "invalid_classId" },
        { status: 400 }
      );
    }
    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "deviceId required" },
        { status: 400 }
      );
    }

    const actor = await resolveApiActor({ req, deviceId });
    if (!actor.ok) {
      return NextResponse.json(
        { ok: false, error: actor.error, message: actor.message },
        { status: actor.status }
      );
    }

    let displayNameArg: string | null | undefined = undefined;
    if (body.displayName !== undefined || body.display_name !== undefined) {
      const normalized = normalizeClassDisplayName(
        body.displayName ?? body.display_name
      );
      if (!normalized.ok) {
        return NextResponse.json(
          { ok: false, error: normalized.error },
          { status: 400 }
        );
      }
      displayNameArg = normalized.value;
    }

    let coverPathArg: string | null | undefined = undefined;
    if (clearCover) {
      coverPathArg = null;
    } else if (body.coverPath !== undefined || body.cover_path !== undefined) {
      coverPathArg = String(body.coverPath ?? body.cover_path ?? "").trim() || null;
    }

    const { data: rpcRaw, error: rpcErr } = await supabaseAdmin.rpc(
      "update_class_presentation",
      {
        p_device_id: actor.actor.deviceId,
        p_class_id: classId,
        p_display_name: displayNameArg ?? null,
        p_cover_path: clearCover ? null : coverPathArg ?? null,
        p_clear_cover: clearCover,
      }
    );

    if (rpcErr) {
      // Fallback direct update if RPC not yet applied but columns exist.
      const { data: membership } = await supabaseAdmin
        .from("class_memberships")
        .select("device_id")
        .eq("class_id", classId)
        .eq("device_id", actor.actor.deviceId)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json(
          { ok: false, error: "not_member" },
          { status: 403 }
        );
      }

      const patch: Record<string, unknown> = {};
      if (displayNameArg !== undefined) patch.display_name = displayNameArg;
      if (clearCover) patch.cover_path = null;
      else if (coverPathArg !== undefined) patch.cover_path = coverPathArg;

      if (Object.keys(patch).length === 0) {
        return NextResponse.json(
          { ok: false, error: "nothing_to_update", detail: rpcErr.message },
          { status: 400 }
        );
      }

      const { data: updated, error: updErr } = await supabaseAdmin
        .from("classes")
        .update(patch)
        .eq("id", classId)
        .select("id, name, display_name, cover_path")
        .maybeSingle();

      if (updErr || !updated) {
        return NextResponse.json(
          {
            ok: false,
            error: "update_failed",
            detail: updErr?.message || rpcErr.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        classId,
        name: updated.name,
        displayName: updated.display_name,
        title: resolveClassTitle({
          name: updated.name,
          display_name: updated.display_name,
        }),
        coverPath: updated.cover_path,
        managementLabel: resolveClassManagementLabel({
          name: updated.name,
          classId,
        }),
      });
    }

    const row = (rpcRaw ?? {}) as Record<string, unknown>;
    if (row.ok !== true) {
      const reason = String(row.reason ?? "update_rejected");
      const status = reason === "not_member" ? 403 : 400;
      return NextResponse.json({ ok: false, error: reason }, { status });
    }

    return NextResponse.json({
      ok: true,
      classId,
      name: row.name ?? null,
      displayName: row.display_name ?? null,
      title: resolveClassTitle({
        name: row.name != null ? String(row.name) : null,
        display_name:
          row.display_name != null ? String(row.display_name) : null,
      }),
      coverPath: row.cover_path ?? null,
      managementLabel: resolveClassManagementLabel({
        name: row.name != null ? String(row.name) : null,
        classId,
      }),
    });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "server_error", detail },
      { status: 500 }
    );
  }
}
