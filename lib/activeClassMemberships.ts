import type { SupabaseClient } from "@supabase/supabase-js";
import { isBillableClassName, isLegacyEntryClassName } from "@/lib/legacyClassNames";
import type { ActorLookup } from "@/lib/actorIdentity";
import { membershipFilterForActor } from "@/lib/actorIdentity";
import { isValidUuid } from "@/lib/userIdentity";

export type ActiveClassMembershipRow = {
  classId: string;
  className: string | null;
  joinedAt: string | null;
  isLegacy: boolean;
  isBillable: boolean;
  classMissing: boolean;
};

export type ActiveMembershipSnapshot = {
  totalCount: number;
  billableCount: number;
  legacyCount: number;
  billableClassIds: string[];
  legacyClassIds: string[];
  rows: ActiveClassMembershipRow[];
};

export type HomeClassVisibilityRow = {
  classId: string;
  className: string | null;
  visible: boolean;
  countsTowardSlots: boolean;
  reason: string | null;
};

export type HomeClassVisibilityDebug = {
  deviceId?: string;
  plan?: { slotLimit: number | null };
  activeMembershipClassIds: string[];
  visibleClassIds: string[];
  slotCountClassIds: string[];
  leftClassIds: string[];
  excludedReasons: Record<string, string>;
  localHiddenDetected?: boolean;
  hidden: HomeClassVisibilityRow[];
};

export type HomeClassSlotContext = {
  deviceId: string;
  slotLimit: number;
  activeMembershipClassIds: string[];
  visibleClassIds: string[];
  slotCountClassIds: string[];
  slotCount: number;
  leftClassIds: string[];
  excludedReasons: Record<string, string>;
  snapshot: ActiveMembershipSnapshot;
  rows: ActiveClassMembershipRow[];
};

function tailId(id: string) {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  return value.length <= 6 ? value : value.slice(-6);
}

export async function fetchActiveClassMemberships(
  sb: SupabaseClient,
  deviceId: string,
  userId?: string | null
): Promise<
  | { ok: true; rows: ActiveClassMembershipRow[] }
  | { ok: false; error: string }
> {
  return fetchActiveClassMembershipsForActor(sb, { deviceId, userId: userId ?? null });
}

export async function fetchActiveClassMembershipsForActor(
  sb: SupabaseClient,
  actor: ActorLookup
): Promise<
  | { ok: true; rows: ActiveClassMembershipRow[] }
  | { ok: false; error: string }
> {
  const filter = membershipFilterForActor(actor);
  const normalizedDeviceId = String(actor.deviceId ?? "").trim();

  if (!filter.value) {
    return { ok: false, error: "device_id_missing" };
  }

  let query = sb.from("class_memberships").select("class_id, joined_at");

  if (filter.column === "user_id") {
    query = query.eq("user_id", filter.value);
  } else {
    query = query.eq("device_id", filter.value);
  }

  const { data, error } = await query;

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

  if (classIds.length === 0) {
    return { ok: true, rows: [] };
  }

  const { data: classRows, error: classErr } = await sb
    .from("classes")
    .select("id, name")
    .in("id", classIds);

  if (classErr) {
    return { ok: false, error: classErr.message };
  }

  const classById = new Map<string, { name: string | null }>();
  for (const row of classRows ?? []) {
    const id = String((row as { id?: unknown }).id ?? "").trim();
    if (!id) continue;
    classById.set(id, {
      name: String((row as { name?: unknown }).name ?? "").trim() || null,
    });
  }

  const joinedAtByClass = new Map<string, string | null>();
  for (const row of membershipRows) {
    const classId = String((row as { class_id?: unknown }).class_id ?? "").trim();
    if (!classId) continue;
    joinedAtByClass.set(
      classId,
      String((row as { joined_at?: unknown }).joined_at ?? "").trim() || null
    );
  }

  const rows: ActiveClassMembershipRow[] = classIds.map((classId) => {
    const classInfo = classById.get(classId);
    const className = classInfo?.name ?? null;
    const isLegacy = isLegacyEntryClassName(className);
    return {
      classId,
      className,
      joinedAt: joinedAtByClass.get(classId) ?? null,
      isLegacy,
      isBillable: isBillableClassName(className),
      classMissing: !classInfo,
    };
  });

  return { ok: true, rows };
}

export function buildActiveMembershipSnapshot(
  rows: ActiveClassMembershipRow[]
): ActiveMembershipSnapshot {
  const billableClassIds: string[] = [];
  const legacyClassIds: string[] = [];

  for (const row of rows) {
    if (row.isBillable) {
      billableClassIds.push(row.classId);
    } else {
      legacyClassIds.push(row.classId);
    }
  }

  return {
    totalCount: rows.length,
    billableCount: billableClassIds.length,
    legacyCount: legacyClassIds.length,
    billableClassIds,
    legacyClassIds,
    rows,
  };
}

/** Home visible + slot-count source of truth: active billable class_memberships only. */
export function resolveHomeVisibleBillableClassIds(
  rows: ActiveClassMembershipRow[]
): {
  visibleClassIds: string[];
  slotCountClassIds: string[];
  excludedReasons: Record<string, string>;
} {
  const visibleClassIds: string[] = [];
  const excludedReasons: Record<string, string> = {};

  for (const row of rows) {
    if (!row.isBillable) {
      excludedReasons[row.classId] = "legacy_entry_class";
      continue;
    }
    visibleClassIds.push(row.classId);
  }

  return {
    visibleClassIds,
    slotCountClassIds: [...visibleClassIds],
    excludedReasons,
  };
}

export function logHomeClassSlotsSnapshot(
  context: Pick<
    HomeClassSlotContext,
    | "deviceId"
    | "slotLimit"
    | "visibleClassIds"
    | "slotCountClassIds"
    | "slotCount"
  >,
  source = "server"
) {
  const visibleIds = context.visibleClassIds.map(tailId).join(",") || "-";
  const slotIds = context.slotCountClassIds.map(tailId).join(",") || "-";
  const invariantOk =
    context.visibleClassIds.length === context.slotCountClassIds.length &&
    context.visibleClassIds.every(
      (id, index) => id === context.slotCountClassIds[index]
    );

  console.log(
    `[class-slots] device=${tailId(context.deviceId)} limit=${context.slotLimit} ` +
      `count=${context.slotCount} slotCountClassIds=${slotIds} ` +
      `visibleClassIds=${visibleIds} source=${source}`
  );

  if (invariantOk) {
    console.log(`[class-slots] invariant-ok visibleEqualsSlot=1`);
  } else {
    console.warn(
      `[class-slots] invariant-violation visibleEqualsSlot=0 ` +
        `visible=${visibleIds} slot=${slotIds}`
    );
  }
}

export async function getActiveMembershipSnapshot(
  sb: SupabaseClient,
  deviceId: string,
  userId?: string | null
): Promise<
  | { ok: true; snapshot: ActiveMembershipSnapshot }
  | { ok: false; error: string }
> {
  const fetched = await fetchActiveClassMemberships(sb, deviceId, userId);
  if (!fetched.ok) {
    return { ok: false, error: fetched.error };
  }

  const snapshot = buildActiveMembershipSnapshot(fetched.rows);
  const resolved = resolveHomeVisibleBillableClassIds(fetched.rows);

  logHomeClassSlotsSnapshot(
    {
      deviceId: String(deviceId ?? "").trim(),
      slotLimit: -1,
      visibleClassIds: resolved.visibleClassIds,
      slotCountClassIds: resolved.slotCountClassIds,
      slotCount: resolved.visibleClassIds.length,
    },
    "membership_snapshot"
  );

  return { ok: true, snapshot };
}

/** @deprecated Use getActiveMembershipSnapshot — kept for existing imports. */
export async function getBillableMembershipSnapshot(
  sb: SupabaseClient,
  deviceId: string,
  userId?: string | null
) {
  const res = await getActiveMembershipSnapshot(sb, deviceId, userId);
  if (!res.ok) {
    return { ok: false as const, error: res.error };
  }
  const snapshot = res.snapshot;
  return {
    ok: true as const,
    snapshot: {
      totalCount: snapshot.totalCount,
      billableCount: snapshot.billableCount,
      legacyCount: snapshot.legacyCount,
      billableClassIds: snapshot.billableClassIds,
      legacyClassIds: snapshot.legacyClassIds,
    },
  };
}

export function buildHomeClassVisibilityDebug(params: {
  rows: ActiveClassMembershipRow[];
  visibleClassIds: string[];
}): HomeClassVisibilityDebug {
  const visibleSet = new Set(params.visibleClassIds);
  const hidden: HomeClassVisibilityRow[] = [];

  for (const row of params.rows) {
    if (visibleSet.has(row.classId)) continue;
    const reason = row.isLegacy
      ? "legacy_entry_class"
      : row.classMissing
        ? "class_row_missing"
        : "filtered";
    hidden.push({
      classId: row.classId,
      className: row.className,
      visible: false,
      countsTowardSlots: row.isBillable,
      reason,
    });
  }

  const excludedReasons: Record<string, string> = {};
  for (const row of hidden) {
    if (row.reason) {
      excludedReasons[row.classId] = row.reason;
    }
  }

  return {
    activeMembershipClassIds: params.rows.map((row) => row.classId),
    visibleClassIds: params.visibleClassIds,
    slotCountClassIds: [...params.visibleClassIds],
    leftClassIds: [],
    excludedReasons,
    hidden,
  };
}
