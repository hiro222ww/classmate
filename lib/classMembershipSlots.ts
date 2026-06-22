import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchActiveClassMemberships,
  buildActiveMembershipSnapshot,
  getActiveMembershipSnapshot,
  getBillableMembershipSnapshot,
  logHomeClassSlotsSnapshot,
  resolveHomeVisibleBillableClassIds,
  type ActiveMembershipSnapshot,
  type HomeClassSlotContext,
} from "@/lib/activeClassMemberships";
import type { ActorLookup } from "@/lib/actorIdentity";
import { getClassSlotsForActor } from "@/lib/actorIdentity";

export type BillableMembershipSnapshot = {
  totalCount: number;
  billableCount: number;
  legacyCount: number;
  billableClassIds: string[];
  legacyClassIds: string[];
};

export { getBillableMembershipSnapshot, getActiveMembershipSnapshot };
export type { ActiveMembershipSnapshot, HomeClassSlotContext };

export async function getHomeClassSlotContext(
  sb: SupabaseClient,
  deviceId: string,
  userId?: string | null
): Promise<
  | { ok: true; context: HomeClassSlotContext }
  | { ok: false; error: string }
> {
  return getHomeClassSlotContextForActor(sb, { deviceId, userId: userId ?? null });
}

export async function getHomeClassSlotContextForActor(
  sb: SupabaseClient,
  actor: ActorLookup
): Promise<
  | { ok: true; context: HomeClassSlotContext }
  | { ok: false; error: string }
> {
  const normalizedDeviceId = String(actor.deviceId ?? "").trim();
  if (!normalizedDeviceId) {
    return { ok: false, error: "device_id_missing" };
  }

  const [membershipRes, slotsRes] = await Promise.all([
    fetchActiveClassMemberships(sb, normalizedDeviceId, actor.userId),
    getClassSlotsForActor(sb, actor),
  ]);

  if (!membershipRes.ok) {
    return { ok: false, error: membershipRes.error };
  }
  if (!slotsRes.ok) {
    return { ok: false, error: slotsRes.error };
  }

  const snapshot = buildActiveMembershipSnapshot(membershipRes.rows);
  const resolved = resolveHomeVisibleBillableClassIds(membershipRes.rows);

  const context: HomeClassSlotContext = {
    deviceId: normalizedDeviceId,
    slotLimit: slotsRes.classSlots,
    activeMembershipClassIds: membershipRes.rows.map((row) => row.classId),
    visibleClassIds: resolved.visibleClassIds,
    slotCountClassIds: resolved.slotCountClassIds,
    slotCount: resolved.visibleClassIds.length,
    leftClassIds: [],
    excludedReasons: resolved.excludedReasons,
    snapshot,
    rows: membershipRes.rows,
  };

  logHomeClassSlotsSnapshot(context, "home_class_slot_context");

  return { ok: true, context };
}

export async function evaluateClassSlotsLimit(
  sb: SupabaseClient,
  deviceId: string,
  params?: { joiningClassId?: string | null; userId?: string | null }
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      allowed: true;
      context: HomeClassSlotContext;
    }
  | {
      ok: true;
      allowed: false;
      context: HomeClassSlotContext;
      reason: "class_slots_limit";
    }
> {
  const ctxRes = await getHomeClassSlotContext(sb, deviceId, params?.userId);
  if (!ctxRes.ok) {
    return { ok: false, error: ctxRes.error };
  }

  const context = ctxRes.context;
  const joiningClassId = String(params?.joiningClassId ?? "").trim();

  if (joiningClassId && context.visibleClassIds.includes(joiningClassId)) {
    return { ok: true, allowed: true, context };
  }

  if (context.slotCount >= context.slotLimit) {
    return {
      ok: true,
      allowed: false,
      context,
      reason: "class_slots_limit",
    };
  }

  return { ok: true, allowed: true, context };
}

export async function getClassSlotsForDevice(
  sb: SupabaseClient,
  deviceId: string,
  userId?: string | null
): Promise<
  | { ok: true; classSlots: number }
  | { ok: false; error: string }
> {
  return getClassSlotsForActor(sb, { deviceId, userId: userId ?? null });
}
