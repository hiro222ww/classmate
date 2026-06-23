import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorLookup } from "@/lib/actorIdentity";
import {
  type ActiveClassMembershipRow,
  resolveHomeVisibleBillableClassIds,
} from "@/lib/activeClassMemberships";
import { getHomeClassSlotContextForActor } from "@/lib/classMembershipSlots";
import { isDeadlinePassed } from "@/lib/recruitment";
import type { CurrentClassSnapshot } from "@/lib/currentClassTypes";
import { pickPrimaryMembershipClassId } from "@/lib/pickPrimaryMembershipClass";

export { pickPrimaryMembershipClassId } from "@/lib/pickPrimaryMembershipClass";

export async function resolveCurrentClassForActor(
  sb: SupabaseClient,
  actor: ActorLookup
): Promise<
  | { ok: true; current: CurrentClassSnapshot | null }
  | { ok: false; error: string }
> {
  const slotCtxRes = await getHomeClassSlotContextForActor(sb, actor);
  if (!slotCtxRes.ok) {
    return { ok: false, error: slotCtxRes.error };
  }

  const { context } = slotCtxRes;
  const classId = pickPrimaryMembershipClassId(
    context.visibleClassIds,
    context.rows
  );

  if (!classId) {
    return { ok: true, current: null };
  }

  const membership = context.rows.find((row) => row.classId === classId);

  const { data: classRow, error: classErr } = await sb
    .from("classes")
    .select("id, name, world_key, topic_key, match_deadline_at")
    .eq("id", classId)
    .maybeSingle();

  if (classErr) {
    return { ok: false, error: classErr.message };
  }

  const topicKey = String(classRow?.topic_key ?? "").trim() || null;
  const worldKey = String(classRow?.world_key ?? "").trim() || null;
  let topicTitle: string | null = null;

  if (topicKey) {
    const { data: topicRow } = await sb
      .from("topics")
      .select("title")
      .eq("topic_key", topicKey)
      .maybeSingle();
    topicTitle = String(topicRow?.title ?? "").trim() || null;
  }

  const statusLabel = isDeadlinePassed(classRow?.match_deadline_at ?? null)
    ? "募集締切"
    : "所属中";

  const resolved = resolveHomeVisibleBillableClassIds(context.rows);
  if (!resolved.visibleClassIds.includes(classId)) {
    return { ok: true, current: null };
  }

  return {
    ok: true,
    current: {
      classId,
      name: String(classRow?.name ?? membership?.className ?? "").trim() || "所属クラス",
      topicKey,
      worldKey,
      topicTitle,
      statusLabel,
      sessionId: null,
      joinedAt: membership?.joinedAt ?? null,
    },
  };
}
