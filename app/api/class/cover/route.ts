import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveApiActor } from "@/lib/actorIdentity";
import { isClassPresentationEditSupported } from "@/lib/classEditSupport";
import { isValidUuid } from "@/lib/userIdentity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 2_500_000; // ~2.5MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function sniffImageMime(buf: Uint8Array): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** POST multipart: deviceId, classId, file — member-only cover upload. */
export async function POST(req: Request) {
  try {
    const supported = await isClassPresentationEditSupported(supabaseAdmin);
    if (!supported) {
      return NextResponse.json(
        { ok: false, error: "feature_not_migrated" },
        { status: 503 }
      );
    }

    const form = await req.formData();
    const deviceId = String(form.get("deviceId") ?? form.get("device_id") ?? "").trim();
    const classId = String(form.get("classId") ?? form.get("class_id") ?? "").trim();
    const file = form.get("file");

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "deviceId required" },
        { status: 400 }
      );
    }
    if (!isValidUuid(classId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_classId" },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "file_required" },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "file_too_large" },
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

    const buf = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffImageMime(buf);
    if (!sniffed || !ALLOWED_MIME.has(sniffed)) {
      return NextResponse.json(
        { ok: false, error: "unsupported_image_type" },
        { status: 400 }
      );
    }

    const objectPath = `${classId}/cover-${Date.now()}.${extForMime(sniffed)}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("class-covers")
      .upload(objectPath, buf, {
        contentType: sniffed,
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "upload_failed",
          detail: uploadErr.message,
        },
        { status: 500 }
      );
    }

    const { data: rpcRaw, error: rpcErr } = await supabaseAdmin.rpc(
      "update_class_presentation",
      {
        p_device_id: actor.actor.deviceId,
        p_class_id: classId,
        p_display_name: null,
        p_cover_path: objectPath,
        p_clear_cover: false,
      }
    );

    if (rpcErr) {
      const { error: updErr } = await supabaseAdmin
        .from("classes")
        .update({ cover_path: objectPath })
        .eq("id", classId);
      if (updErr) {
        return NextResponse.json(
          {
            ok: false,
            error: "cover_path_update_failed",
            detail: updErr.message,
            coverPath: objectPath,
          },
          { status: 500 }
        );
      }
    } else if ((rpcRaw as { ok?: boolean } | null)?.ok !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: String((rpcRaw as { reason?: string })?.reason ?? "update_rejected"),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      classId,
      coverPath: objectPath,
    });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "server_error", detail },
      { status: 500 }
    );
  }
}
