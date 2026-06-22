import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  hasLinkedEmailFromAuthUser,
  isValidUuid,
  type UserIdentity,
} from "@/lib/userIdentity";

export type ResolvedRequestIdentity = UserIdentity & {
  accessToken: string | null;
  authError: string | null;
};

export async function verifySupabaseAccessToken(
  accessToken: string | null | undefined
) {
  const token = String(accessToken ?? "").trim();
  if (!token) {
    return { user: null, error: "missing_access_token" as const };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return {
      user: null,
      error: error?.message ?? "invalid_access_token",
    };
  }

  return { user: data.user, error: null };
}

export async function resolveRequestIdentity(params: {
  req: Request;
  deviceId?: unknown;
  accessToken?: string | null;
  requireAuth?: boolean;
}): Promise<
  | { ok: true; identity: ResolvedRequestIdentity }
  | { ok: false; status: number; error: string; message?: string }
> {
  const deviceId = String(
    params.deviceId ?? params.req.headers.get("x-device-id") ?? ""
  ).trim();

  if (!isValidUuid(deviceId)) {
    return {
      ok: false,
      status: 400,
      error: "device_id_required",
      message: "端末IDが必要です。",
    };
  }

  const accessToken =
    params.accessToken ??
    (() => {
      const header = params.req.headers.get("authorization") ?? "";
      const match = header.match(/^Bearer\s+(.+)$/i);
      return match?.[1]?.trim() ?? null;
    })();

  const verified = await verifySupabaseAccessToken(accessToken);
  if (!verified.user) {
    if (params.requireAuth) {
      return {
        ok: false,
        status: 401,
        error: "auth_required",
        message: "認証が必要です。",
      };
    }

    return {
      ok: true,
      identity: {
        userId: "",
        deviceId,
        isAnonymous: true,
        hasLinkedEmail: false,
        email: null,
        accessToken: null,
        authError: verified.error,
      },
    };
  }

  const user = verified.user;
  const userId = String(user.id ?? "").trim();
  if (!isValidUuid(userId)) {
    return {
      ok: false,
      status: 401,
      error: "invalid_user",
    };
  }

  const { data: deviceLink, error: deviceLinkError } = await supabaseAdmin
    .from("user_devices")
    .select("device_id,user_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (deviceLinkError) {
    return {
      ok: false,
      status: 500,
      error: "device_link_lookup_failed",
      message: deviceLinkError.message,
    };
  }

  if (deviceLink?.user_id && deviceLink.user_id !== userId) {
    return {
      ok: false,
      status: 403,
      error: "device_user_mismatch",
      message: "この端末は別のアカウントに紐付いています。",
    };
  }

  return {
    ok: true,
    identity: {
      userId,
      deviceId,
      isAnonymous: Boolean(user.is_anonymous),
      hasLinkedEmail: hasLinkedEmailFromAuthUser(user),
      email: user.email ?? null,
      accessToken: accessToken ?? null,
      authError: null,
    },
  };
}

export async function assertDeviceOwnedByUser(userId: string, deviceId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_devices")
    .select("device_id")
    .eq("device_id", deviceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  if (!data) {
    return { ok: false as const, error: "device_not_linked" };
  }

  return { ok: true as const };
}
