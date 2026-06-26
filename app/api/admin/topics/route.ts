// app/api/admin/topics/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeGenderRestriction } from "@/lib/genderRestriction";
import { adminActorFromRequest, writeAdminAuditLog } from "@/lib/adminAuditLog";
import { TOPIC_PUBLIC_SELECT } from "@/lib/topicManagement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  "";

type TopicRow = {
  topic_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
  monthly_price: number;
  gender_restriction?: string | null;
  is_archived?: boolean;
  is_active?: boolean;
  is_paid?: boolean;
  display_order?: number;
  accepting_new_users?: boolean;
  badge_label?: string | null;
  default_world_key?: string | null;
  created_at?: string;
  updated_at?: string;
};

function bad(status: number, error: string, extra?: Record<string, any>) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(extra ?? {}),
    },
    { status }
  );
}

function ok(body: Record<string, any> = {}) {
  return NextResponse.json({
    ok: true,
    ...body,
  });
}

function getSupabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: {
      persistSession: false,
    },
  });
}

function toNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTopicInput(t: any) {
  const topic_key = String(t?.topic_key ?? "").trim();
  const title = String(t?.title ?? "").trim();

  const description =
    typeof t?.description === "string"
      ? t.description
      : "";

  const is_sensitive = Boolean(t?.is_sensitive);

  const min_age = toNum(t?.min_age, 0);

  const monthly_price = toNum(t?.monthly_price, 0);

  const gender_restriction = normalizeGenderRestriction(
    t?.gender_restriction
  );

  const is_active =
    t?.is_active === undefined ? true : Boolean(t?.is_active);
  const is_paid =
    t?.is_paid === undefined
      ? toNum(t?.monthly_price, 0) > 0
      : Boolean(t?.is_paid);
  const display_order = toNum(t?.display_order, 0);
  const accepting_new_users =
    t?.accepting_new_users === undefined
      ? true
      : Boolean(t?.accepting_new_users);
  const badge_label =
    typeof t?.badge_label === "string" && t.badge_label.trim()
      ? t.badge_label.trim()
      : null;

  return {
    topic_key,
    title,
    description,
    is_sensitive,
    min_age,
    monthly_price,
    gender_restriction,
    is_active,
    is_paid,
    display_order,
    accepting_new_users,
    badge_label,
  };
}

/**
 * デフォルトクラス(classes)生成
 */
async function ensureDefaultBoard(
  supabase: ReturnType<typeof getSupabase>,
  topic: {
    topic_key: string;
    title: string;
    description: string;
    is_sensitive: boolean;
    min_age: number;
  },
  opts?: {
    world_key?: string | null;
  }
) {
  const topic_key = topic.topic_key;

  const { data: exists, error: exErr } =
    await supabase
      .from("classes")
      .select("id")
      .eq("topic_key", topic_key)
      .limit(1);

  if (exErr) {
    throw new Error(exErr.message);
  }

  if (!exists || exists.length === 0) {
    const cls: any = {
      name: topic.title,
      description: topic.description || "",
      world_key: opts?.world_key ?? null,
      topic_key,
      min_age: topic.min_age ?? 0,
      is_sensitive: topic.is_sensitive ?? false,
      is_user_created: false,
    };

    const { error: cInsErr } =
      await supabase
        .from("classes")
        .insert(cls);

    if (cInsErr) {
      throw new Error(
        `class create failed: ${cInsErr.message}`
      );
    }
  }
}

async function attachDefaultWorldKeys(
  supabase: ReturnType<typeof getSupabase>,
  topics: TopicRow[]
) {
  const topicKeys = topics
    .map((topic) => String(topic.topic_key ?? "").trim())
    .filter(Boolean);

  if (topicKeys.length === 0) return topics;

  const { data: classRows, error } = await supabase
    .from("classes")
    .select("topic_key,world_key,created_at")
    .in("topic_key", topicKeys)
    .eq("is_user_created", false)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const worldByTopic = new Map<string, string | null>();
  for (const row of classRows ?? []) {
    const topicKey = String(row.topic_key ?? "").trim();
    if (!topicKey || worldByTopic.has(topicKey)) continue;
    const worldKey = String(row.world_key ?? "").trim();
    worldByTopic.set(topicKey, worldKey || null);
  }

  return topics.map((topic) => ({
    ...topic,
    default_world_key: worldByTopic.get(topic.topic_key) ?? null,
  }));
}

async function syncTopicDefaultWorldKey(
  supabase: ReturnType<typeof getSupabase>,
  params: {
    topic_key: string;
    world_key: string | null;
    topic?: {
      title: string;
      description: string;
      is_sensitive: boolean;
      min_age: number;
    };
  }
) {
  const topic_key = String(params.topic_key ?? "").trim();
  if (!topic_key) return;

  const world_key = String(params.world_key ?? "").trim() || null;

  const { data: existing, error: lookupErr } = await supabase
    .from("classes")
    .select("id")
    .eq("topic_key", topic_key)
    .eq("is_user_created", false);

  if (lookupErr) {
    throw new Error(lookupErr.message);
  }

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from("classes")
      .update({ world_key })
      .eq("topic_key", topic_key)
      .eq("is_user_created", false);

    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  if (params.topic && world_key) {
    await ensureDefaultBoard(
      supabase,
      {
        topic_key,
        title: params.topic.title,
        description: params.topic.description,
        is_sensitive: params.topic.is_sensitive,
        min_age: params.topic.min_age,
      },
      { world_key }
    );
  }
}

function buildTopicUpdatePatch(patch: Partial<TopicRow>) {
  const updatePatch: Record<string, unknown> = {};

  if (typeof patch.title === "string") {
    updatePatch.title = patch.title;
  }

  if (typeof patch.description === "string") {
    updatePatch.description = patch.description;
  }

  if (typeof patch.is_sensitive === "boolean") {
    updatePatch.is_sensitive = patch.is_sensitive;
  }

  if (typeof patch.min_age === "number") {
    updatePatch.min_age = patch.min_age;
  }

  if (typeof patch.monthly_price === "number") {
    updatePatch.monthly_price = patch.monthly_price;
  }

  if (
    patch.gender_restriction === null ||
    patch.gender_restriction === "none" ||
    patch.gender_restriction === "male" ||
    patch.gender_restriction === "female"
  ) {
    updatePatch.gender_restriction = normalizeGenderRestriction(
      patch.gender_restriction
    );
  }

  if (typeof patch.is_active === "boolean") {
    updatePatch.is_active = patch.is_active;
  }

  if (typeof patch.is_paid === "boolean") {
    updatePatch.is_paid = patch.is_paid;
  }

  if (typeof patch.display_order === "number") {
    updatePatch.display_order = patch.display_order;
  }

  if (typeof patch.accepting_new_users === "boolean") {
    updatePatch.accepting_new_users = patch.accepting_new_users;
  }

  if (patch.badge_label === null) {
    updatePatch.badge_label = null;
  } else if (typeof patch.badge_label === "string") {
    const trimmed = patch.badge_label.trim();
    updatePatch.badge_label = trimmed || null;
  }

  updatePatch.updated_at = new Date().toISOString();

  return updatePatch;
}

export async function POST(req: Request) {
  try {
    const denied = requireAdmin(req);

    if (denied) {
      return denied;
    }

    if (!SUPABASE_URL) {
      return bad(500, "SUPABASE_URL is not set");
    }

    if (!SERVICE_ROLE) {
      return bad(500, "SUPABASE_SERVICE_ROLE_KEY is not set");
    }

    const body = await req.json().catch(() => ({}));

    const mode = String(body?.mode ?? "").trim();

    if (!mode) {
      return bad(400, "mode is required");
    }

    const supabase = getSupabase();

    if (mode === "list") {
      const showArchived = Boolean(body?.show_archived);

      let q = supabase
        .from("topics")
        .select(TOPIC_PUBLIC_SELECT)
        .order("is_archived", { ascending: true })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (!showArchived) {
        q = q.eq("is_archived", false);
      }

      const { data, error } = await q;

      if (error) {
        return bad(500, error.message);
      }

      const topicsWithWorld = await attachDefaultWorldKeys(
        supabase,
        (data ?? []) as TopicRow[]
      );

      return ok({
        topics: topicsWithWorld,
      });
    }

    if (mode === "create") {
      const t = body?.topic ?? {};

      const {
        topic_key,
        title,
        description,
        is_sensitive,
        min_age,
        monthly_price,
        gender_restriction,
        is_active,
        is_paid,
        display_order,
        accepting_new_users,
        badge_label,
      } = normalizeTopicInput(t);

      if (!topic_key) {
        return bad(400, "topic.topic_key is required");
      }

      if (!title) {
        return bad(400, "topic.title is required");
      }

      const row: any = {
        topic_key,
        title,
        description,
        is_sensitive,
        min_age,
        monthly_price,
        gender_restriction,
        is_archived: false,
        is_active,
        is_paid,
        display_order,
        accepting_new_users,
        badge_label,
        updated_at: new Date().toISOString(),
      };

      const { data: insTopic, error: insErr } =
        await supabase
          .from("topics")
          .insert(row)
          .select(TOPIC_PUBLIC_SELECT)
          .maybeSingle();

      if (insErr) {
        return bad(500, insErr.message);
      }

      try {
        await ensureDefaultBoard(
          supabase,
          {
            topic_key,
            title,
            description,
            is_sensitive,
            min_age,
          },
          {
            world_key: body?.default_world_key ?? null,
          }
        );
      } catch (e: any) {
        return bad(
          500,
          e?.message ?? "class create failed",
          {
            inserted_topic: insTopic ?? null,
          }
        );
      }

      return ok({
        inserted_topic: insTopic ?? null,
      });
    }

    if (mode === "update" || mode === "bulk_update") {
      const updates =
        mode === "bulk_update"
          ? (Array.isArray(body?.topics) ? body.topics : [])
          : [
              {
                topic_key: body?.topic_key,
                patch: body?.patch ?? {},
              },
            ];

      if (updates.length === 0) {
        return bad(400, "topics is required");
      }

      let savedCount = 0;

      for (const entry of updates) {
        const topic_key = String(entry?.topic_key ?? "").trim();
        const patch = (entry?.patch ?? {}) as Partial<TopicRow>;

        if (!topic_key) {
          return bad(400, "topic_key is required");
        }

        const { data: beforeTopic } = await supabase
          .from("topics")
          .select(
            "topic_key,title,description,is_sensitive,min_age,is_archived,is_active"
          )
          .eq("topic_key", topic_key)
          .maybeSingle();

        if (!beforeTopic) {
          return bad(404, `topic not found: ${topic_key}`);
        }

        const updatePatch = buildTopicUpdatePatch(patch);

        if (
          typeof patch.is_sensitive === "boolean" ||
          typeof patch.min_age === "number"
        ) {
          await writeAdminAuditLog({
            actor: adminActorFromRequest(req),
            action: "topic.age_or_sensitive",
            target: topic_key,
            before: {
              is_sensitive: beforeTopic?.is_sensitive ?? null,
              min_age: beforeTopic?.min_age ?? null,
            },
            after: {
              is_sensitive:
                typeof patch.is_sensitive === "boolean"
                  ? patch.is_sensitive
                  : beforeTopic?.is_sensitive ?? null,
              min_age:
                typeof patch.min_age === "number"
                  ? patch.min_age
                  : beforeTopic?.min_age ?? null,
            },
          });
        }

        if (Object.keys(updatePatch).length > 0) {
          const { error } = await supabase
            .from("topics")
            .update(updatePatch)
            .eq("topic_key", topic_key);

          if (error) {
            return bad(500, error.message);
          }
        }

        if (Object.prototype.hasOwnProperty.call(patch, "default_world_key")) {
          const world_key =
            patch.default_world_key === null
              ? null
              : String(patch.default_world_key ?? "").trim() || null;

          await syncTopicDefaultWorldKey(supabase, {
            topic_key,
            world_key,
            topic: {
              title:
                typeof patch.title === "string"
                  ? patch.title
                  : String(beforeTopic.title ?? ""),
              description:
                typeof patch.description === "string"
                  ? patch.description
                  : String(beforeTopic.description ?? ""),
              is_sensitive:
                typeof patch.is_sensitive === "boolean"
                  ? patch.is_sensitive
                  : Boolean(beforeTopic.is_sensitive),
              min_age:
                typeof patch.min_age === "number"
                  ? patch.min_age
                  : Number(beforeTopic.min_age ?? 0),
            },
          });
        }

        savedCount += 1;
      }

      return ok({ savedCount });
    }

    if (mode === "archive" || mode === "unarchive") {
      const topic_key = String(body?.topic_key ?? "").trim();

      if (!topic_key) {
        return bad(400, "topic_key is required");
      }

      const is_archived = mode === "archive";

      const { error } =
        await supabase
          .from("topics")
          .update({
            is_archived,
            ...(is_archived
              ? { is_active: false }
              : { is_active: true }),
            updated_at: new Date().toISOString(),
          })
          .eq("topic_key", topic_key);

      if (error) {
        return bad(500, error.message);
      }

      return ok();
    }

    if (mode === "delete") {
      const topic_key = String(body?.topic_key ?? "").trim();

      if (!topic_key) {
        return bad(400, "topic_key is required");
      }

      const { data: t, error: tErr } =
        await supabase
          .from("topics")
          .select("topic_key,is_archived")
          .eq("topic_key", topic_key)
          .maybeSingle();

      if (tErr) {
        return bad(500, tErr.message);
      }

      if (!t) {
        return bad(404, "topic not found");
      }

      if (!t.is_archived) {
        return bad(
          400,
          "topic must be archived before delete",
          {
            code: "must_archive_first",
          }
        );
      }

      const { error: delAutoErr } =
        await supabase
          .from("classes")
          .delete()
          .eq("topic_key", topic_key)
          .eq("is_user_created", false);

      if (delAutoErr) {
        return bad(
          500,
          `delete default classes failed: ${delAutoErr.message}`
        );
      }

      const { count, error: cErr } =
        await supabase
          .from("classes")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("topic_key", topic_key);

      if (cErr) {
        return bad(500, cErr.message);
      }

      if ((count ?? 0) > 0) {
        return bad(
          400,
          "topic is used by classes; cannot delete",
          {
            code: "topic_in_use",
            count,
          }
        );
      }

      const { error: dErr } =
        await supabase
          .from("topics")
          .delete()
          .eq("topic_key", topic_key);

      if (dErr) {
        return bad(500, dErr.message);
      }

      return ok();
    }

    return bad(400, `unknown mode: ${mode}`);
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "admin topics failed",
      },
      { status: 500 }
    );
  }
}