import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isMissingProfileColumnError,
  type UserProfileRow,
} from "@/lib/userProfileRow";

type ProfileWriteMode =
  | { type: "device_upsert"; deviceId: string }
  | { type: "user_update"; userId: string };

function stripLegalProfileFields(row: UserProfileRow) {
  const {
    terms_agreed_at: _terms,
    privacy_agreed_at: _privacy,
    guidelines_agreed_at: _guidelines,
    legal_consent_version: _legal,
    terms_version: _termsVersion,
    ...basePayload
  } = row;
  return basePayload;
}

async function writeProfileRow(
  mode: ProfileWriteMode,
  payload: UserProfileRow
): Promise<{ error: string | null }> {
  const run = async (row: UserProfileRow) => {
    if (mode.type === "user_update") {
      return supabaseAdmin
        .from("user_profiles")
        .update(row)
        .eq("user_id", mode.userId);
    }

    return supabaseAdmin
      .from("user_profiles")
      .upsert(row, { onConflict: "device_id" });
  };

  let { error } = await run(payload);

  if (error && isMissingProfileColumnError(error.message)) {
    ({ error } = await run(stripLegalProfileFields(payload) as UserProfileRow));
  }

  return { error: error?.message ?? null };
}

export function resolveProfileWriteMode(params: {
  deviceId: string;
  linkedUserId: string | null;
  existingProfile: Partial<UserProfileRow> | null;
}): ProfileWriteMode {
  const deviceId = String(params.deviceId ?? "").trim();
  const linkedUserId = String(params.linkedUserId ?? "").trim();
  const existingUserId = String(params.existingProfile?.user_id ?? "").trim();
  const existingDeviceId = String(params.existingProfile?.device_id ?? "").trim();

  if (
    linkedUserId &&
    existingUserId === linkedUserId &&
    existingDeviceId &&
    existingDeviceId !== deviceId
  ) {
    return { type: "user_update", userId: linkedUserId };
  }

  return { type: "device_upsert", deviceId };
}

export function resolveProfileConfirmFilter(params: {
  deviceId: string;
  linkedUserId: string | null;
  writeMode: ProfileWriteMode;
}): { column: "device_id" | "user_id"; value: string } {
  if (params.writeMode.type === "user_update") {
    return { column: "user_id", value: params.writeMode.userId };
  }

  return { column: "device_id", value: params.deviceId };
}

export async function persistUserProfileRow(params: {
  deviceId: string;
  linkedUserId: string | null;
  existingProfile: Partial<UserProfileRow> | null;
  payload: UserProfileRow;
}): Promise<{ error: string | null; writeMode: ProfileWriteMode }> {
  const writeMode = resolveProfileWriteMode(params);
  const canonicalDeviceId =
    writeMode.type === "user_update"
      ? String(params.existingProfile?.device_id ?? "").trim() || params.deviceId
      : params.deviceId;

  const row: UserProfileRow = {
    ...params.payload,
    device_id: canonicalDeviceId,
    user_id:
      params.linkedUserId ??
      params.existingProfile?.user_id ??
      params.payload.user_id ??
      null,
  };

  const { error } = await writeProfileRow(writeMode, row);
  return { error, writeMode };
}
