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
    console.log("[profile][GET] error", {
      device_id,
      message: error.message,
      details: (error as any)?.details ?? null,
      hint: (error as any)?.hint ?? null,
      code: (error as any)?.code ?? null,
    });
    return new NextResponse(error.message, { status: 500 });
  }

  console.log("[profile][GET] result", data ?? null);

  return NextResponse.json(data ?? null, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
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

  const device_id = String(form.get("device_id") ?? "").trim();
  const display_name = String(form.get("display_name") ?? "").trim();
  const birth_date = String(form.get("birth_date") ?? "").trim();
  const gender = String(form.get("gender") ?? "").trim();

  const guardian_consent =
    String(form.get("guardian_consent") ?? "false") === "true";

  const photo = form.get("photo");

  console.log("[profile][POST] incoming", {
    device_id,
    display_name,
    birth_date,
    gender,
    hasPhoto: photo instanceof File && photo.size > 0,
    photoName: photo instanceof File ? photo.name : null,
    photoType: photo instanceof File ? photo.type : null,
    photoSize: photo instanceof File ? photo.size : null,
  });

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
    console.log("[profile][POST] existing profile read error", {
      device_id,
      message: existingError.message,
      details: (existingError as any)?.details ?? null,
      hint: (existingError as any)?.hint ?? null,
      code: (existingError as any)?.code ?? null,
    });
    return new NextResponse(existingError.message, { status: 500 });
  }

  console.log("[profile][POST] existing profile", {
    device_id,
    existing_photo_path: String(existingProfile?.photo_path ?? "").trim() || null,
  });

  let photo_path: string | null =
    String(existingProfile?.photo_path ?? "").trim() || null;

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
      console.log("[profile][POST] upload ng", {
        device_id,
        objectPath,
        message: uploadError.message,
      });
      return new NextResponse(uploadError.message, { status: 500 });
    }

    console.log("[profile][POST] upload ok", {
      device_id,
      objectPath,
    });

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
    console.log("[profile][POST] upsert ng", {
      device_id,
      payload,
      message: error.message,
      details: (error as any)?.details ?? null,
      hint: (error as any)?.hint ?? null,
      code: (error as any)?.code ?? null,
    });
    return new NextResponse(error.message, { status: 500 });
  }

  console.log("[profile][POST] upsert ok", {
    device_id,
    photo_path: photo_path ?? null,
  });

  // 念のため保存結果を再読込して確認
  const { data: confirmData, error: confirmError } = await supabaseAdmin
    .from("user_profiles")
    .select("device_id, display_name, birth_date, gender, photo_path")
    .eq("device_id", device_id)
    .maybeSingle();

  if (confirmError) {
    console.log("[profile][POST] confirm read error", {
      device_id,
      message: confirmError.message,
      details: (confirmError as any)?.details ?? null,
      hint: (confirmError as any)?.hint ?? null,
      code: (confirmError as any)?.code ?? null,
    });
  } else {
    console.log("[profile][POST] confirm result", confirmData ?? null);
  }

  void guardian_consent;

  return NextResponse.json(
    {
      ok: true,
      photo_path: photo_path ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}