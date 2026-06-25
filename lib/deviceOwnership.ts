import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  hashDeviceSecret,
  isValidDeviceSecret,
  pickDeviceSecretFromRequest,
} from "@/lib/deviceSecret";
import { isValidUuid } from "@/lib/userIdentity";

export class DeviceOwnershipError extends Error {
  code: string;
  action?: string;

  constructor(code: string, message: string, action?: string) {
    super(message);
    this.code = code;
    this.action = action;
  }
}

function profileHasClaimableData(profile: {
  display_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
} | null) {
  if (!profile) return false;
  return Boolean(
    String(profile.display_name ?? "").trim() ||
      String(profile.birth_date ?? "").trim() ||
      String(profile.gender ?? "").trim()
  );
}

export async function assertDeviceBootstrapAllowed(params: {
  req: Request;
  userId: string;
  deviceId: string;
  bodySecret?: unknown;
  hasLinkedEmail?: boolean;
  allowSecretReregistration?: boolean;
}) {
  const { userId, deviceId } = params;
  const deviceSecret = pickDeviceSecretFromRequest(params.req, params.bodySecret);
  const canReregisterSecret =
    params.allowSecretReregistration === true ||
    params.hasLinkedEmail === true;

  const { data: deviceLink, error: deviceLinkError } = await supabaseAdmin
    .from("user_devices")
    .select("user_id,device_secret_hash")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (deviceLinkError) {
    throw new DeviceOwnershipError(
      "device_link_lookup_failed",
      deviceLinkError.message
    );
  }

  if (deviceLink?.user_id && deviceLink.user_id !== userId) {
    throw new DeviceOwnershipError(
      "device_user_mismatch",
      "この端末は別のアカウントに紐付いています。"
    );
  }

  if (deviceLink?.device_secret_hash) {
    if (!isValidDeviceSecret(deviceSecret)) {
      if (canReregisterSecret && deviceLink.user_id === userId) {
        throw new DeviceOwnershipError(
          "device_secret_required",
          "端末の再登録が必要です。ページを再読み込みしてください。",
          "reregister_device"
        );
      }

      throw new DeviceOwnershipError(
        "device_secret_required",
        "ログインしてアカウントを復元してください。",
        "restore_login"
      );
    }

    const providedHash = hashDeviceSecret(deviceSecret);
    if (providedHash !== deviceLink.device_secret_hash) {
      if (canReregisterSecret && deviceLink.user_id === userId) {
        return {
          deviceSecretHash: providedHash,
          reregisteredDevice: true,
        };
      }

      throw new DeviceOwnershipError(
        "device_secret_mismatch",
        "ログインしてアカウントを復元してください。",
        "restore_login"
      );
    }
  }

  const { data: profileByDevice, error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .select("device_id,user_id,display_name,birth_date,gender")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (profileError) {
    throw new DeviceOwnershipError("profile_lookup_failed", profileError.message);
  }

  if (
    profileByDevice?.user_id &&
    profileByDevice.user_id !== userId
  ) {
    throw new DeviceOwnershipError(
      "profile_user_mismatch",
      "この端末のプロフィールは別のアカウントに紐付いています。"
    );
  }

  const { data: profileByUser } = await supabaseAdmin
    .from("user_profiles")
    .select("device_id,user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    profileByUser?.device_id &&
    profileByUser.device_id !== deviceId &&
    profileHasClaimableData(profileByDevice)
  ) {
    throw new DeviceOwnershipError(
      "profile_device_conflict",
      "別のアカウントにプロフィールがあります。ログイン後にプロフィールを再登録してください。",
      "needs_profile"
    );
  }

  const shouldSetSecret =
    !deviceLink?.device_secret_hash &&
    isValidDeviceSecret(deviceSecret);

  return {
    deviceSecretHash: shouldSetSecret
      ? hashDeviceSecret(deviceSecret)
      : deviceLink?.device_secret_hash ?? null,
    reregisteredDevice: false,
  };
}

export async function upsertUserDeviceLink(params: {
  userId: string;
  deviceId: string;
  deviceSecretHash?: string | null;
}) {
  if (!isValidUuid(params.userId) || !isValidUuid(params.deviceId)) {
    throw new Error("invalid_identity");
  }

  await supabaseAdmin.from("user_devices").upsert(
    {
      device_id: params.deviceId,
      user_id: params.userId,
      device_secret_hash: params.deviceSecretHash ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" }
  );
}
