import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { upsertUserDeviceLink } from "@/lib/deviceOwnership";
import { isValidUuid } from "@/lib/userIdentity";

export type IdentityBootstrapResult = {
  profileMigrated: boolean;
  entitlementsLinked: boolean;
  billingLinked: boolean;
  matchPrefsLinked: boolean;
};

async function linkSatelliteRows(userId: string, deviceId: string) {
  const now = new Date().toISOString();
  let entitlementsLinked = false;
  let billingLinked = false;
  let matchPrefsLinked = false;

  const { data: entitlements } = await supabaseAdmin
    .from("user_entitlements")
    .select(
      "device_id,user_id,plan,class_slots,can_create_classes,topic_plan,theme_pass,manual_override,manual_override_updated_at,updated_at"
    )
    .eq("device_id", deviceId)
    .maybeSingle();

  const { data: entitlementsByUser } = await supabaseAdmin
    .from("user_entitlements")
    .select("device_id,user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (entitlementsByUser) {
    if (!entitlementsByUser.user_id) {
      await supabaseAdmin
        .from("user_entitlements")
        .update({ user_id: userId, updated_at: now })
        .eq("device_id", entitlementsByUser.device_id);
      entitlementsLinked = true;
    }
  } else if (entitlements) {
    await supabaseAdmin.from("user_entitlements").upsert(
      {
        ...entitlements,
        user_id: userId,
        device_id: deviceId,
        updated_at: now,
      },
      { onConflict: "device_id" }
    );
    entitlementsLinked = true;
  }

  const { data: billingByUser } = await supabaseAdmin
    .from("user_billing_customers")
    .select("device_id,user_id,stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: billingByDevice } = await supabaseAdmin
    .from("user_billing_customers")
    .select("device_id,stripe_customer_id,user_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (billingByUser) {
    if (!billingByDevice) {
      await supabaseAdmin.from("user_billing_customers").upsert(
        {
          user_id: userId,
          device_id: deviceId,
          stripe_customer_id: billingByUser.stripe_customer_id,
          updated_at: now,
        },
        { onConflict: "device_id" }
      );
      billingLinked = true;
    } else if (!billingByDevice.user_id) {
      await supabaseAdmin
        .from("user_billing_customers")
        .update({ user_id: userId, updated_at: now })
        .eq("device_id", deviceId);
      billingLinked = true;
    }
  } else if (billingByDevice && !billingByDevice.user_id) {
    await supabaseAdmin
      .from("user_billing_customers")
      .update({ user_id: userId, updated_at: now })
      .eq("device_id", deviceId);
    billingLinked = true;
  }

  const { data: matchPrefs } = await supabaseAdmin
    .from("user_match_prefs")
    .select("device_id,user_id")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (matchPrefs && !matchPrefs.user_id) {
    await supabaseAdmin
      .from("user_match_prefs")
      .update({ user_id: userId, updated_at: now })
      .eq("device_id", deviceId);
    matchPrefsLinked = true;
  }

  await supabaseAdmin
    .from("class_memberships")
    .update({ user_id: userId })
    .eq("device_id", deviceId)
    .is("user_id", null);

  await supabaseAdmin
    .from("session_members")
    .update({ user_id: userId })
    .eq("device_id", deviceId)
    .is("user_id", null);

  return { entitlementsLinked, billingLinked, matchPrefsLinked };
}

export async function bootstrapUserIdentity(params: {
  userId: string;
  deviceId: string;
  deviceSecretHash?: string | null;
}): Promise<IdentityBootstrapResult> {
  const userId = String(params.userId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();

  if (!isValidUuid(userId) || !isValidUuid(deviceId)) {
    throw new Error("invalid_identity");
  }

  let profileMigrated = false;

  await upsertUserDeviceLink({
    userId,
    deviceId,
    deviceSecretHash: params.deviceSecretHash ?? null,
  });

  const { data: profileByDevice } = await supabaseAdmin
    .from("user_profiles")
    .select("device_id,user_id,display_name,birth_date,gender,photo_path,hobbies,bio,show_age")
    .eq("device_id", deviceId)
    .maybeSingle();

  const { data: profileByUser } = await supabaseAdmin
    .from("user_profiles")
    .select("device_id,user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileByDevice && !profileByDevice.user_id) {
    await supabaseAdmin
      .from("user_profiles")
      .update({ user_id: userId })
      .eq("device_id", deviceId);
    profileMigrated = true;
  } else if (!profileByDevice && !profileByUser) {
    await supabaseAdmin.from("user_profiles").upsert(
      {
        device_id: deviceId,
        user_id: userId,
        display_name: null,
        birth_date: null,
        gender: null,
        photo_path: null,
      },
      { onConflict: "device_id" }
    );
    profileMigrated = true;
  } else if (!profileByDevice && profileByUser) {
    // 別端末ログイン: 既存 user_id プロフィールを維持し、この端末は user_devices のみ紐付け
    profileMigrated = false;
  }

  const satellite = await linkSatelliteRows(userId, deviceId);

  return {
    profileMigrated,
    ...satellite,
  };
}

export async function resolveUserIdForDevice(deviceId: string) {
  const normalized = String(deviceId ?? "").trim();
  if (!isValidUuid(normalized)) return null;

  const { data: link } = await supabaseAdmin
    .from("user_devices")
    .select("user_id")
    .eq("device_id", normalized)
    .maybeSingle();

  if (link?.user_id) return link.user_id;

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id")
    .eq("device_id", normalized)
    .maybeSingle();

  return profile?.user_id ?? null;
}

export async function lookupEntitlements(params: {
  userId?: string | null;
  deviceId?: string | null;
}) {
  const userId = String(params.userId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();

  if (userId && isValidUuid(userId)) {
    const { data, error } = await supabaseAdmin
      .from("user_entitlements")
      .select(
        "device_id,user_id,plan,class_slots,can_create_classes,topic_plan,theme_pass,manual_override,manual_override_updated_at,updated_at"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }

  if (deviceId && isValidUuid(deviceId)) {
    const { data, error } = await supabaseAdmin
      .from("user_entitlements")
      .select(
        "device_id,user_id,plan,class_slots,can_create_classes,topic_plan,theme_pass,manual_override,manual_override_updated_at,updated_at"
      )
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }

  return null;
}
