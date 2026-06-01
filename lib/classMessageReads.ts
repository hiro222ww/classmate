import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertClassMembership,
  normalizeMeetingClassId,
  normalizeMeetingDeviceId,
} from "@/lib/meetingPlan";

export function normalizeReadDeviceId(value: unknown) {
  return normalizeMeetingDeviceId(value);
}

export function normalizeReadClassId(value: unknown) {
  return normalizeMeetingClassId(value);
}

export { assertClassMembership };

export async function fetchUnreadCountsForClasses(
  deviceId: string,
  classIds: string[]
): Promise<Map<string, number> | null> {
  const normalizedDeviceId = normalizeReadDeviceId(deviceId);
  const ids = Array.from(
    new Set(classIds.map((id) => normalizeReadClassId(id)).filter(Boolean))
  );

  if (!normalizedDeviceId || ids.length === 0) {
    return new Map<string, number>();
  }

  const [readsRes, messagesRes] = await Promise.all([
    supabaseAdmin
      .from("class_message_reads")
      .select("class_id, last_read_at")
      .eq("device_id", normalizedDeviceId)
      .in("class_id", ids),
    supabaseAdmin
      .from("class_messages")
      .select("class_id, device_id, created_at")
      .in("class_id", ids)
      .neq("device_id", normalizedDeviceId),
  ]);

  if (readsRes.error || messagesRes.error) {
    console.warn("[classMessageReads] unread lookup failed", {
      readsError: readsRes.error?.message,
      messagesError: messagesRes.error?.message,
    });
    return null;
  }

  const lastReadByClass = new Map<string, number>();
  for (const row of readsRes.data ?? []) {
    const classId = normalizeReadClassId(
      (row as { class_id?: string }).class_id
    );
    const lastReadAt = String(
      (row as { last_read_at?: string }).last_read_at ?? ""
    ).trim();
    if (!classId || !lastReadAt) continue;
    const t = new Date(lastReadAt).getTime();
    if (Number.isFinite(t)) lastReadByClass.set(classId, t);
  }

  const counts = new Map<string, number>();
  for (const classId of ids) counts.set(classId, 0);

  for (const row of messagesRes.data ?? []) {
    const classId = normalizeReadClassId(
      (row as { class_id?: string }).class_id
    );
    const createdAtRaw = String(
      (row as { created_at?: string }).created_at ?? ""
    ).trim();
    if (!classId || !createdAtRaw) continue;

    const createdAt = new Date(createdAtRaw).getTime();
    if (!Number.isFinite(createdAt)) continue;

    const lastReadAt = lastReadByClass.get(classId) ?? 0;
    if (createdAt > lastReadAt) {
      counts.set(classId, (counts.get(classId) ?? 0) + 1);
    }
  }

  return counts;
}

export async function markClassMessagesRead(deviceId: string, classId: string) {
  const normalizedDeviceId = normalizeReadDeviceId(deviceId);
  const normalizedClassId = normalizeReadClassId(classId);

  if (!normalizedDeviceId || !normalizedClassId) {
    return { ok: false as const, error: "invalid_input" };
  }

  const membership = await assertClassMembership(
    normalizedDeviceId,
    normalizedClassId
  );
  if (!membership.ok) {
    return {
      ok: false as const,
      error: membership.error,
      status: membership.status,
    };
  }

  const { data: latestRows, error: latestErr } = await supabaseAdmin
    .from("class_messages")
    .select("created_at")
    .eq("class_id", normalizedClassId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (latestErr) {
    return { ok: false as const, error: "latest_message_lookup_failed" };
  }

  const latestCreatedAt = String(
    (latestRows?.[0] as { created_at?: string } | undefined)?.created_at ?? ""
  ).trim();
  const nowIso = new Date().toISOString();
  let lastReadAt = nowIso;

  if (latestCreatedAt && Number.isFinite(new Date(latestCreatedAt).getTime())) {
    const latestMs = new Date(latestCreatedAt).getTime();
    const nowMs = new Date(nowIso).getTime();
    lastReadAt = new Date(Math.max(latestMs, nowMs)).toISOString();
  }

  const { error } = await supabaseAdmin.from("class_message_reads").upsert(
    {
      class_id: normalizedClassId,
      device_id: normalizedDeviceId,
      last_read_at: lastReadAt,
      updated_at: nowIso,
    },
    { onConflict: "class_id,device_id" }
  );

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const, last_read_at: lastReadAt };
}
