import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jstWallTimeToIso } from "@/lib/experience/time";
import {
  EXPERIENCE_MAX_MEMBERS,
  type ExperienceEventRow,
  type ExperienceEventStatus,
} from "@/lib/experience/types";
import {
  isExperienceFeatureEnabled,
  setExperienceFeatureEnabled,
} from "@/lib/experience/settings";
import { markPastEventsEnded } from "@/lib/experience/status";

export async function listExperienceEvents(): Promise<ExperienceEventRow[]> {
  await markPastEventsEnded();
  const { data, error } = await supabaseAdmin
    .from("experience_events")
    .select(
      "id, title, starts_at, ends_at, status, max_members, class_id, session_id, created_at, updated_at"
    )
    .order("starts_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExperienceEventRow[];
}

export async function createExperienceEvent(input: {
  title?: string;
  startsAtJst: string;
  endsAtJst: string;
  maxMembers?: number;
}): Promise<{ ok: true; event: ExperienceEventRow } | { ok: false; error: string }> {
  const startsAt = jstWallTimeToIso(input.startsAtJst);
  const endsAt = jstWallTimeToIso(input.endsAtJst);
  if (!startsAt || !endsAt) return { ok: false, error: "invalid_datetime" };
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { ok: false, error: "ends_before_starts" };
  }
  const maxMembers = Math.min(
    EXPERIENCE_MAX_MEMBERS,
    Math.max(1, Number(input.maxMembers ?? EXPERIENCE_MAX_MEMBERS) || 5)
  );
  const title = String(input.title ?? "").trim() || "期間限定の体験会";

  const { data, error } = await supabaseAdmin
    .from("experience_events")
    .insert({
      title,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "scheduled" satisfies ExperienceEventStatus,
      max_members: maxMembers,
    })
    .select(
      "id, title, starts_at, ends_at, status, max_members, class_id, session_id, created_at, updated_at"
    )
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  // Creating a schedule implies the home card should be visible.
  await setExperienceFeatureEnabled(true);

  return { ok: true, event: data as ExperienceEventRow };
}

export async function updateExperienceEvent(input: {
  id: string;
  title?: string;
  startsAtJst?: string;
  endsAtJst?: string;
  maxMembers?: number;
  status?: ExperienceEventStatus;
}): Promise<{ ok: true; event: ExperienceEventRow } | { ok: false; error: string }> {
  const id = String(input.id ?? "").trim();
  if (!id) return { ok: false, error: "missing_id" };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) {
    patch.title = String(input.title).trim() || "期間限定の体験会";
  }
  if (input.startsAtJst) {
    const startsAt = jstWallTimeToIso(input.startsAtJst);
    if (!startsAt) return { ok: false, error: "invalid_starts_at" };
    patch.starts_at = startsAt;
  }
  if (input.endsAtJst) {
    const endsAt = jstWallTimeToIso(input.endsAtJst);
    if (!endsAt) return { ok: false, error: "invalid_ends_at" };
    patch.ends_at = endsAt;
  }
  if (input.maxMembers !== undefined) {
    patch.max_members = Math.min(
      EXPERIENCE_MAX_MEMBERS,
      Math.max(1, Number(input.maxMembers) || 5)
    );
  }
  if (input.status) {
    patch.status = input.status;
  }

  const { data, error } = await supabaseAdmin
    .from("experience_events")
    .update(patch)
    .eq("id", id)
    .select(
      "id, title, starts_at, ends_at, status, max_members, class_id, session_id, created_at, updated_at"
    )
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "update_failed" };

  const event = data as ExperienceEventRow;
  if (new Date(event.ends_at) <= new Date(event.starts_at)) {
    return { ok: false, error: "ends_before_starts" };
  }

  // Restoring / keeping a scheduled event should surface it on home.
  if (event.status === "scheduled") {
    await setExperienceFeatureEnabled(true);
  }

  return { ok: true, event };
}

export async function getExperienceAdminSnapshot() {
  const [featureEnabled, events] = await Promise.all([
    isExperienceFeatureEnabled(),
    listExperienceEvents(),
  ]);
  return { featureEnabled, events };
}

export { setExperienceFeatureEnabled };
