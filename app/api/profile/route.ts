import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getAgeFromBirthDate } from "@/lib/age";
import { canViewMemberProfile } from "@/lib/memberProfileAccess";
import {
  adultOnlyUserMessage,
  isMinorsRegistrationAllowed,
} from "@/lib/agePolicy";
import { moderateUserText } from "@/lib/contentModeration";
import {
  isUserProfileComplete,
  normalizeProfileAge,
} from "@/lib/profileClient";

type ProfileRow = {
  device_id: string;
  display_name: string | null;
  birth_date: string | null;
  gender: string | null;
  photo_path: string | null;
  hobbies: string | null;
  bio: string | null;
  show_age: boolean;
};

const MAX_OPTIONAL_TEXT_LENGTH = 500;

function normalizeOptionalText(v: unknown) {
  const trimmed = normalizeString(v);
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_OPTIONAL_TEXT_LENGTH);
}

function normalizeString(v: unknown) {
  return String(v ?? "").trim();
}

function normalizePhotoPath(photoPath: unknown) {
  let normalized = normalizeString(photoPath);
  if (!normalized) return null;

  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  ) {
    return normalized;
  }

  if (normalized.startsWith("profile-photos/")) {
    normalized = normalized.replace(/^profile-photos\//, "");
  }

  if (normalized.startsWith("avatars/")) {
    normalized = normalized.replace(/^avatars\//, "");
  }

  return normalized || null;
}

function normalizeShowAge(value: unknown, fallback = true): boolean {
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  return fallback;
}

function toProfileResponse(row: Partial<ProfileRow> | null) {
  if (!row) return null;

  return {
    device_id: normalizeString(row.device_id) || null,
    display_name: normalizeString(row.display_name) || null,
    birth_date: normalizeString(row.birth_date) || null,
    gender: normalizeString(row.gender) || null,
    photo_path: normalizePhotoPath(row.photo_path),
    hobbies: normalizeOptionalText(row.hobbies),
    bio: normalizeOptionalText(row.bio),
    show_age: normalizeShowAge(row.show_age),
  };
}

function calcAge(birthDateISO: string): number | null {
  return getAgeFromBirthDate(birthDateISO);
}

function calcAgeFromProfile(
  profile: ReturnType<typeof toProfileResponse>
): number | null {
  if (!profile?.birth_date) return null;
  return normalizeProfileAge(calcAge(profile.birth_date));
}

function toPublicProfileResponse(
  row: Partial<ProfileRow> | null,
  age: number | null,
  profileComplete: boolean
) {
  if (!row) return null;

  return {
    device_id: normalizeString(row.device_id) || null,
    display_name: normalizeString(row.display_name) || null,
    photo_path: normalizePhotoPath(row.photo_path),
    gender: profileComplete ? normalizeString(row.gender) || null : null,
    age,
    hobbies: normalizeOptionalText(row.hobbies),
    bio: normalizeOptionalText(row.bio),
    profile_complete: profileComplete,
  };
}

/**
 * プロフィール取得
 * GET /api/profile?device_id=xxxx
 * 他人参照時: viewer_device_id + class_id または session_id が必要
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const device_id = normalizeString(searchParams.get("device_id"));
  const viewer_device_id =
    normalizeString(searchParams.get("viewer_device_id")) || device_id;
  const class_id = normalizeString(searchParams.get("class_id"));
  const session_id = normalizeString(searchParams.get("session_id"));

  if (!device_id) {
    return NextResponse.json(
      {
        ok: false,
        error: "device_id_required",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select(
      "device_id, display_name, birth_date, gender, photo_path, hobbies, bio, show_age"
    )
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

    return NextResponse.json(
      {
        ok: false,
        error: "profile_get_failed",
        message: error.message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  const profile = toProfileResponse(data);
  const profileComplete = isUserProfileComplete(profile);
  const isSelf = device_id === viewer_device_id;

  if (!isSelf) {
    const allowed = await canViewMemberProfile({
      viewerDeviceId: viewer_device_id,
      targetDeviceId: device_id,
      classId: class_id || undefined,
      sessionId: session_id || undefined,
    });

    if (!allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "profile_view_forbidden",
        },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        }
      );
    }

    const showAge = normalizeShowAge(data?.show_age);
    const publicAge = showAge ? calcAgeFromProfile(profile) : null;
    const publicProfile = toPublicProfileResponse(
      data,
      publicAge,
      profileComplete
    );

    console.log("[profile][GET] public result", {
      viewer_device_id,
      device_id,
      class_id: class_id || null,
      session_id: session_id || null,
      found: !!publicProfile,
    });

    return NextResponse.json(
      {
        ok: true,
        profile: publicProfile,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  console.log("[profile][GET] self result", {
    device_id,
    found: !!profile,
    display_name: profile?.display_name ?? null,
    photo_path: profile?.photo_path ?? null,
    profile_complete: profileComplete,
  });

  const selfAge = calcAgeFromProfile(profile);

  return NextResponse.json(
    {
      ok: true,
      profile: profile
        ? {
            ...profile,
            age: selfAge,
            profile_complete: profileComplete,
          }
        : null,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}

/**
 * プロフィール保存（写真含む）
 * POST /api/profile
 */
export async function POST(req: Request) {
  const form = await req.formData();

  const device_id = normalizeString(form.get("device_id"));
  const display_name = normalizeString(form.get("display_name"));
  const birth_date = normalizeString(form.get("birth_date"));
  const gender = normalizeString(form.get("gender"));
  const hobbies = normalizeOptionalText(form.get("hobbies"));
  const bio = normalizeOptionalText(form.get("bio"));
  const show_age_input = form.get("show_age");

  const guardian_consent =
    normalizeString(form.get("guardian_consent")) === "true";

  const photo = form.get("photo");

  console.log("[profile][POST] incoming", {
    device_id,
    display_name,
    birth_date,
    gender,
    hobbies,
    bio,
    hasPhoto: photo instanceof File && photo.size > 0,
    photoName: photo instanceof File ? photo.name : null,
    photoType: photo instanceof File ? photo.type : null,
    photoSize: photo instanceof File ? photo.size : null,
  });

  if (!device_id || !display_name || !birth_date || !gender) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_fields",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  if (gender !== "male" && gender !== "female") {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_gender",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  const age = calcAge(birth_date);
  if (age === null) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_birth_date",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  if (age < 18) {
    const minorsAllowed = await isMinorsRegistrationAllowed();

    if (!minorsAllowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "minors_disabled",
          message: adultOnlyUserMessage(),
        },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        }
      );
    }

    if (!guardian_consent) {
      return NextResponse.json(
        {
          ok: false,
          error: "guardian_consent_required",
        },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        }
      );
    }
  }

  for (const field of [
    { name: "display_name", value: display_name },
    { name: "hobbies", value: hobbies ?? "" },
    { name: "bio", value: bio ?? "" },
  ]) {
    const moderation = await moderateUserText(field.value);
    if (!moderation.ok && moderation.block) {
      return NextResponse.json(
        {
          ok: false,
          error: "contact_exchange_blocked",
          message: moderation.message,
          field: field.name,
        },
        { status: 400 }
      );
    }
  }

  const { data: existingProfile, error: existingError } = await supabaseAdmin
    .from("user_profiles")
    .select("photo_path, show_age")
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

    return NextResponse.json(
      {
        ok: false,
        error: "profile_existing_read_failed",
        message: existingError.message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  let photo_path: string | null = normalizePhotoPath(existingProfile?.photo_path);

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

      return NextResponse.json(
        {
          ok: false,
          error: "profile_photo_upload_failed",
          message: uploadError.message,
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        }
      );
    }

    console.log("[profile][POST] upload ok", {
      device_id,
      objectPath,
    });

    photo_path = objectPath;
  }

  const show_age =
    show_age_input === null || show_age_input === undefined || show_age_input === ""
      ? normalizeShowAge(existingProfile?.show_age)
      : normalizeShowAge(show_age_input);

  const payload: ProfileRow = {
    device_id,
    display_name,
    birth_date,
    gender,
    photo_path,
    hobbies,
    bio,
    show_age,
  };

  const { error: upsertError } = await supabaseAdmin
    .from("user_profiles")
    .upsert(payload, { onConflict: "device_id" });

  if (upsertError) {
    console.log("[profile][POST] upsert ng", {
      device_id,
      payload,
      message: upsertError.message,
      details: (upsertError as any)?.details ?? null,
      hint: (upsertError as any)?.hint ?? null,
      code: (upsertError as any)?.code ?? null,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "profile_upsert_failed",
        message: upsertError.message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  const { data: confirmData, error: confirmError } = await supabaseAdmin
    .from("user_profiles")
    .select(
      "device_id, display_name, birth_date, gender, photo_path, hobbies, bio, show_age"
    )
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

    return NextResponse.json(
      {
        ok: false,
        error: "profile_confirm_read_failed",
        message: confirmError.message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  const profile = toProfileResponse(confirmData);

  console.log("[profile][POST] confirm result", {
    device_id,
    display_name: profile?.display_name ?? null,
    photo_path: profile?.photo_path ?? null,
  });

  return NextResponse.json(
    {
      ok: true,
      profile,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}