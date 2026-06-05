import type { SupabaseClient } from "@supabase/supabase-js";
import { isBillableClassName } from "@/lib/legacyClassNames";

export type BillableMembershipSnapshot = {
  totalCount: number;
  billableCount: number;
  legacyCount: number;
  billableClassIds: string[];
  legacyClassIds: string[];
};

export async function getBillableMembershipSnapshot(
  sb: SupabaseClient,
  deviceId: string
): Promise<
  | { ok: true; snapshot: BillableMembershipSnapshot }
  | { ok: false; error: string }
> {
  const normalizedDeviceId = String(deviceId ?? "").trim();
  if (!normalizedDeviceId) {
    return { ok: false, error: "device_id_missing" };
  }

  const { data, error } = await sb
    .from("class_memberships")
    .select("class_id")
    .eq("device_id", normalizedDeviceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  const membershipRows = data ?? [];
  const classIds = Array.from(
    new Set(
      membershipRows
        .map((row) => String((row as { class_id?: unknown }).class_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const classNameById = new Map<string, string>();
  if (classIds.length > 0) {
    const { data: classRows, error: classErr } = await sb
      .from("classes")
      .select("id,name")
      .in("id", classIds);

    if (classErr) {
      return { ok: false, error: classErr.message };
    }

    for (const row of classRows ?? []) {
      const id = String((row as { id?: unknown }).id ?? "").trim();
      if (!id) continue;
      classNameById.set(id, String((row as { name?: unknown }).name ?? ""));
    }
  }

  const billableClassIds: string[] = [];
  const legacyClassIds: string[] = [];

  for (const classId of classIds) {
    const className = classNameById.get(classId) ?? null;
    if (isBillableClassName(className)) {
      billableClassIds.push(classId);
    } else {
      legacyClassIds.push(classId);
    }
  }

  const totalCount = billableClassIds.length + legacyClassIds.length;

  const snapshot = {
    totalCount,
    billableCount: billableClassIds.length,
    legacyCount: legacyClassIds.length,
    billableClassIds,
    legacyClassIds,
  };

  console.log(
    `[class-slots] count activeMemberships=${snapshot.billableCount} ` +
      `legacy=${snapshot.legacyCount} total=${snapshot.totalCount} ` +
      `classIds=${snapshot.billableClassIds.map((id) => id.slice(-6)).join(",") || "-"}`
  );

  return {
    ok: true,
    snapshot,
  };
}

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
