import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveDisplayName } from "@/lib/resolveDisplayName";
import {
  assertClassMembership,
  normalizeMeetingClassId,
  normalizeMeetingDeviceId,
  postMeetingPlanSystemMessage,
} from "@/lib/meetingPlan";

export const CALL_REQUEST_TTL_MS = 15 * 60 * 1000;
export const DEFAULT_CALL_REQUEST_MESSAGE = "今ひま？";

export type CallRequestRow = {
  id: string;
  class_id: string;
  created_by_device_id: string;
  message: string;
  created_at: string;
  expires_at: string;
  canceled_at?: string | null;
};

export type CallRequestPublic = {
  id: string;
  class_id: string;
  message: string;
  created_by_device_id: string;
  creator_display_name: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
  is_mine: boolean;
  display_label: string;
};

export function normalizeCallRequestDeviceId(value: unknown) {
  return normalizeMeetingDeviceId(value);
}

export function normalizeCallRequestClassId(value: unknown) {
  return normalizeMeetingClassId(value);
}

export function isCallRequestActive(
  row: Pick<CallRequestRow, "expires_at" | "canceled_at">,
  now = new Date()
) {
  if (row.canceled_at) return false;
  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > now.getTime();
}

export function buildCallRequestDisplayLabel(
  creatorDisplayName: string,
  isMine = false
) {
  if (isMine) return "あなたが今話せる人を探しています";
  const name = String(creatorDisplayName ?? "").trim() || "クラスメート";
  return `${name}さんが今話せる人を探しています`;
}

export function toCallRequestPublic(
  row: CallRequestRow,
  creatorDisplayName: string,
  viewerDeviceId?: string,
  now = new Date()
): CallRequestPublic {
  const name = String(creatorDisplayName ?? "").trim() || "クラスメート";
  const isActive = isCallRequestActive(row, now);
  const isMine =
    Boolean(viewerDeviceId) &&
    row.created_by_device_id === normalizeCallRequestDeviceId(viewerDeviceId);

  return {
    id: row.id,
    class_id: row.class_id,
    message: row.message || DEFAULT_CALL_REQUEST_MESSAGE,
    created_by_device_id: row.created_by_device_id,
    creator_display_name: name,
    created_at: row.created_at,
    expires_at: row.expires_at,
    is_active: isActive,
    is_mine: isMine,
    display_label: buildCallRequestDisplayLabel(name, isMine),
  };
}

async function loadDisplayNames(deviceIds: string[]) {
  const ids = Array.from(
    new Set(deviceIds.map((id) => normalizeCallRequestDeviceId(id)).filter(Boolean))
  );

  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("device_id, display_name")
    .in("device_id", ids);

  for (const row of data ?? []) {
    const deviceId = normalizeCallRequestDeviceId(
      (row as { device_id?: string }).device_id
    );
    if (!deviceId) continue;

    const resolved = resolveDisplayName({
      profileDisplayName: (row as { display_name?: string | null }).display_name,
    });
    map.set(deviceId, resolved.displayName);
  }

  return map;
}

export async function fetchActiveCallRequest(classId: string) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("class_call_requests")
    .select(
      "id, class_id, created_by_device_id, message, created_at, expires_at, canceled_at"
    )
    .eq("class_id", classId)
    .is("canceled_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false as const, error };
  }

  if (!data) {
    return { ok: true as const, request: null };
  }

  return { ok: true as const, request: data as CallRequestRow };
}

export async function fetchActiveCallRequestsForClasses(
  classIds: string[],
  viewerDeviceId?: string
) {
  const ids = Array.from(
    new Set(classIds.map((id) => id.trim()).filter(Boolean))
  );
  if (ids.length === 0) {
    return new Map<string, CallRequestPublic>();
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("class_call_requests")
    .select(
      "id, class_id, created_by_device_id, message, created_at, expires_at, canceled_at"
    )
    .in("class_id", ids)
    .is("canceled_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) {
    return null;
  }

  const creatorIds = (data ?? []).map(
    (row) => (row as CallRequestRow).created_by_device_id
  );
  const nameMap = await loadDisplayNames(creatorIds);

  const map = new Map<string, CallRequestPublic>();
  for (const row of data ?? []) {
    const classId = String((row as CallRequestRow).class_id ?? "").trim();
    if (!classId || map.has(classId)) continue;

    const creatorId = normalizeCallRequestDeviceId(
      (row as CallRequestRow).created_by_device_id
    );
    const creatorName = nameMap.get(creatorId) ?? "クラスメート";
    map.set(
      classId,
      toCallRequestPublic(row as CallRequestRow, creatorName, viewerDeviceId)
    );
  }

  return map;
}

export async function cancelCallRequestById(requestId: string) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("class_call_requests")
    .update({ canceled_at: now })
    .eq("id", requestId)
    .is("canceled_at", null);

  return { ok: !error, error };
}

export async function buildCreateCallRequestMessage(deviceId: string) {
  const nameMap = await loadDisplayNames([deviceId]);
  const name =
    nameMap.get(normalizeCallRequestDeviceId(deviceId)) ?? "クラスメート";
  return `${name}さんが「今ひま？」を送りました`;
}

export async function postCallRequestSystemMessage(input: {
  deviceId: string;
  classId: string;
  message: string;
}) {
  return postMeetingPlanSystemMessage(input);
}

export { assertClassMembership };
