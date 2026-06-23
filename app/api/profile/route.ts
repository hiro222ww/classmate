import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getAgeFromBirthDate } from "@/lib/age";
import { canViewMemberProfile } from "@/lib/memberProfileAccess";
import { moderateUserText } from "@/lib/contentModeration";
import {
  buildLegalConsentPayload,
  buildLegalConsentStatus,
  hasValidLegalConsent,
  parseLegalAgreementFlag,
  type LegalConsentFields,
} from "@/lib/legalConsent";
import {
  isUserProfileComplete,
  normalizeProfileAge,
} from "@/lib/profileClient";
import { resolveRequestIdentity } from "@/lib/requestIdentity";
import { bootstrapUserIdentity } from "@/lib/userIdentityMigration";
import { enforceProfileSaveAge, joinAgeGuardResponse } from "@/lib/joinAgeGuard";
import {
  USER_PROFILE_BASE_SELECT,
  USER_PROFILE_LEGAL_CONSENT_SELECT,
  USER_PROFILE_LEGAL_SELECT,
  isMissingProfileColumnError,
  type UserProfileRow,
} from "@/lib/userProfileRow";

type ProfileRow = UserProfileRow;

async function fetchProfileRowByFilter(filter: {
  column: "device_id" | "user_id";
  value: string;
}): Promise<{ data: Partial<ProfileRow> | null; error: string | null }> {
  const query = supabaseAdmin
    .from("user_profiles")
    .select(USER_PROFILE_LEGAL_SELECT)
    .eq(filter.column, filter.value);

  const { data, error } = await query.maybeSingle();

  if (!error) {
    return { data: (data as Partial<ProfileRow> | null) ?? null, error: null };
  }

  if (!isMissingProfileColumnError(error.message)) {
    return { data: null, error: error.message };
  }

  console.warn("[profile] legal columns missing; falling back to base select", {
    column: filter.column,
    message: error.message,
  });

  const fallback = await supabaseAdmin
    .from("user_profiles")
    .select(USER_PROFILE_BASE_SELECT)
    .eq(filter.column, filter.value)
    .maybeSingle();

  if (fallback.error) {
    return { data: null, error: fallback.error.message };
  }

  return {
    data: (fallback.data as Partial<ProfileRow> | null) ?? null,
    error: null,
  };
}

async function fetchExistingProfileConsent(deviceId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select(USER_PROFILE_LEGAL_CONSENT_SELECT)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!error) {
    return {
      data: (data as Partial<ProfileRow> | null) ?? null,
      error: null as string | null,
    };
  }

  if (!isMissingProfileColumnError(error.message)) {
    return { data: null, error: error.message };
  }

  const fallback = await supabaseAdmin
    .from("user_profiles")
    .select("photo_path, show_age, user_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  return {
    data: (fallback.data as Partial<ProfileRow> | null) ?? null,
    error: fallback.error?.message ?? null,
  };
}

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

  const isSelf = device_id === viewer_device_id;
  let data: any = null;

  if (isSelf) {
    const identity = await resolveRequestIdentity({ req, deviceId: device_id });
    if (identity.ok && identity.identity.userId) {
      const byUser = await fetchProfileRowByFilter({
        column: "user_id",
        value: identity.identity.userId,
      });

      if (byUser.error) {
        console.log("[profile][GET] user lookup error", {
          device_id,
          message: byUser.error,
        });
        return NextResponse.json(
          {
            ok: false,
            error: "profile_get_failed",
            message: byUser.error,
          },
          {
            status: 500,
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            },
          }
        );
      }

      if (byUser.data) {
        data = byUser.data;
      }
    }
  }

  if (!data) {
    const byDevice = await fetchProfileRowByFilter({
      column: "device_id",
      value: device_id,
    });

    if (byDevice.error) {
      console.log("[profile][GET] error", {
        device_id,
        message: byDevice.error,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "profile_get_failed",
          message: byDevice.error,
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        }
      );
    }

    data = byDevice.data;
  }

  const profile = toProfileResponse(data);
  const profileComplete = isUserProfileComplete(profile);

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
  const legalConsent = buildLegalConsentStatus(data as LegalConsentFields);

  return NextResponse.json(
    {
      ok: true,
      profile: profile
        ? {
            ...profile,
            age: selfAge,
            profile_complete: profileComplete,
            legal_consent: legalConsent,
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

  const termsAgreed = parseLegalAgreementFlag(form.get("terms_agreed"));
  const privacyAgreed = parseLegalAgreementFlag(form.get("privacy_agreed"));
  const guidelinesAgreed = parseLegalAgreementFlag(form.get("guidelines_agreed"));

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

  let linkedUserId: string | null = null;
  const identity = await resolveRequestIdentity({ req, deviceId: device_id });
  if (identity.ok && identity.identity.userId) {
    linkedUserId = identity.identity.userId;
    try {
      await bootstrapUserIdentity({
        userId: linkedUserId,
        deviceId: device_id,
      });
    } catch (bootstrapError) {
      console.warn("[profile][POST] identity bootstrap failed", bootstrapError);
    }
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

  const ageGuard = await enforceProfileSaveAge({
    age,
    guardianConsent: guardian_consent,
  });
  if (!ageGuard.ok) {
    return joinAgeGuardResponse(ageGuard);
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

  const existingProfileRes = await fetchExistingProfileConsent(device_id);
  const existingProfile = existingProfileRes.data;
  const existingError = existingProfileRes.error;

  if (existingError) {
    console.log("[profile][POST] existing profile read error", {
      device_id,
      message: existingError,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "profile_existing_read_failed",
        message: existingError,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  const existingConsent = existingProfile as LegalConsentFields | null;
  const alreadyValid = hasValidLegalConsent(existingConsent);

  if (!alreadyValid) {
    if (!termsAgreed || !privacyAgreed || !guidelinesAgreed) {
      return NextResponse.json(
        {
          ok: false,
          error: "legal_consent_required",
          message:
            "利用規約、プライバシーポリシー、コミュニティガイドラインへの同意が必要です。",
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        }
      );
    }
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

  const consentFields: LegalConsentFields = alreadyValid
    ? {
        terms_agreed_at: existingConsent?.terms_agreed_at ?? null,
        privacy_agreed_at: existingConsent?.privacy_agreed_at ?? null,
        guidelines_agreed_at: existingConsent?.guidelines_agreed_at ?? null,
        legal_consent_version: existingConsent?.legal_consent_version ?? null,
        terms_version:
          existingConsent?.terms_version ??
          existingConsent?.legal_consent_version ??
          null,
      }
    : buildLegalConsentPayload();

  const payload: ProfileRow = {
    device_id,
    user_id: linkedUserId ?? existingProfile?.user_id ?? null,
    display_name,
    birth_date,
    gender,
    photo_path,
    hobbies,
    bio,
    show_age,
    ...consentFields,
  };

  const { error: upsertError } = await supabaseAdmin
    .from("user_profiles")
    .upsert(payload, { onConflict: "device_id" });

  if (upsertError && isMissingProfileColumnError(upsertError.message)) {
    console.warn("[profile][POST] legal columns missing; upserting base fields only", {
      device_id,
      message: upsertError.message,
    });

    const {
      terms_agreed_at: _t,
      privacy_agreed_at: _p,
      guidelines_agreed_at: _g,
      legal_consent_version: _l,
      terms_version: _v,
      ...basePayload
    } = payload;

    const { error: baseUpsertError } = await supabaseAdmin
      .from("user_profiles")
      .upsert(basePayload, { onConflict: "device_id" });

    if (baseUpsertError) {
      console.log("[profile][POST] base upsert ng", {
        device_id,
        message: baseUpsertError.message,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "profile_upsert_failed",
          message: baseUpsertError.message,
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        }
      );
    }
  } else if (upsertError) {
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

  const confirmResult = await fetchProfileRowByFilter({
    column: "device_id",
    value: device_id,
  });
  const confirmData = confirmResult.data;
  const confirmError = confirmResult.error;

  if (confirmError) {
    console.log("[profile][POST] confirm read error", {
      device_id,
      message: confirmError,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "profile_confirm_read_failed",
        message: confirmError,
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
  const legalConsent = buildLegalConsentStatus(confirmData as LegalConsentFields);

  console.log("[profile][POST] confirm result", {
    device_id,
    display_name: profile?.display_name ?? null,
    photo_path: profile?.photo_path ?? null,
    legal_consent_valid: legalConsent.valid,
  });

  return NextResponse.json(
    {
      ok: true,
      profile: profile
        ? {
            ...profile,
            legal_consent: legalConsent,
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