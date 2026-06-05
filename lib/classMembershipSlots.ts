import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getActiveMembershipSnapshot,
  getBillableMembershipSnapshot,
  type ActiveMembershipSnapshot,
} from "@/lib/activeClassMemberships";

export type BillableMembershipSnapshot = {
  totalCount: number;
  billableCount: number;
  legacyCount: number;
  billableClassIds: string[];
  legacyClassIds: string[];
};

export { getBillableMembershipSnapshot, getActiveMembershipSnapshot };
export type { ActiveMembershipSnapshot };

export async function getClassSlotsForDevice(
  sb: SupabaseClient,
  deviceId: string
): Promise<
  | { ok: true; classSlots: number }
  | { ok: false; error: string }
> {
  const normalizedDeviceId = String(deviceId ?? "").trim();
  if (!normalizedDeviceId) {
    return { ok: false, error: "device_id_missing" };
  }

  const { data, error } = await sb
    .from("user_entitlements")
    .select("class_slots")
    .eq("device_id", normalizedDeviceId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    classSlots: Math.max(1, Number(data?.class_slots ?? 1)),
  };
}
