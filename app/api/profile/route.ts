import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

/**
 * プロフィール取得
 * GET /api/profile?device_id=xxxx
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const device_id = searchParams.get("device_id");

  if (!device_id) {
    return new NextResponse("device_id is required", { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("device_id, display_name, birth_date, gender, photo_path")
    .eq("device_id", device_id)
    .maybeSingle();

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

function calcAge(birthDateISO: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateISO)) return null;

  const birth = new Date(birthDateISO);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * プロフィール保存（写真含む）
 * POST /api/profile
 */
export async function POST(req: Request) {
  const form = await req.formData();

  const device_id = String(form.get("device_id") ?? "");
  const display_name = String(form.get("display_name") ?? "");
  const birth_date = String(form.get("birth_date") ?? "");
  const gender = String(form.get("gender") ?? "");

  const guardian_consent =
    String(form.get("guardian_consent") ?? "false") === "true";

  if (!device_id || !display_name || !birth_date || !gender) {
    return new NextResponse("missing fields", { status: 400 });
  }

  if (gender !== "male" && gender !== "female") {
    return new NextResponse("invalid gender", { status: 400 });
  }

  const age = calcAge(birth_date);
  if (age === null) {
    return new NextResponse("invalid birth_date", { status: 400 });
  }

  if (age < 18) {
    return new NextResponse("adults_only", { status: 403 });
  }

  // 既存プロフィールを先に読む
  const { data: existingProfile, error: existingError } = await supabaseAdmin
    .from("user_profiles")
    .select("photo_path")
    .eq("device_id", device_id)
    .maybeSingle();

  if (existingError) {
    return new NextResponse(existingError.message, { status: 500 });
  }

  let photo_path: string | null =
    String(existingProfile?.photo_path ?? "").trim() || null;

  const photo = form.get("photo");

  if (photo instanceof File && photo.size > 0) {
    const ext = photo.name.split(".").pop()?.toLowerCase() || "jpg";
    const objectPath = `${device_id}/profile-${Date.now()}.${ext}`;
    const buffer = await photo.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from("profile-photos")
      .upload(objectPath, buffer, {
        contentType: photo.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      return new NextResponse(uploadError.message, { status: 500 });
    }

    photo_path = objectPath;
  }

  const payload: {
    device_id: string;
    display_name: string;
    birth_date: string;
    gender: string;
    photo_path?: string;
  } = {
    device_id,
    display_name,
    birth_date,
    gender,
  };

  if (photo_path) {
    payload.photo_path = photo_path;
  }

  const { error } = await supabaseAdmin
    .from("user_profiles")
    .upsert(payload, { onConflict: "device_id" });

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  void guardian_consent;

  return NextResponse.json({
    ok: true,
    photo_path: photo_path ?? null,
  });
}