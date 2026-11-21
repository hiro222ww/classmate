import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { redactFeedbackText } from "@/lib/feedback/sanitize";
import { classifyFeedbackHeuristic } from "@/lib/feedback/classify";
import {
  clusterFingerprint,
  clusterTitleFromSummary,
  tokenOverlapRatio,
  uniqueVoiceKey,
} from "@/lib/feedback/cluster";
import type {
  FeedbackCategory,
  FeedbackStatus,
  UserFeedbackClusterRow,
  UserFeedbackRow,
} from "@/lib/feedback/types";
import { notifySafetyFeedback } from "@/lib/feedback/notify";

const CATEGORIES = new Set<FeedbackCategory>([
  "bug",
  "request",
  "ux",
  "safety",
  "other",
]);

export async function submitUserFeedback(params: {
  deviceId: string;
  userId?: string | null;
  category: FeedbackCategory;
  body: string;
  pageContext?: string | null;
}): Promise<
  | { ok: true; feedbackId: string; safetyFlag: boolean; clusterId: string | null }
  | { ok: false; error: string; detail?: string }
> {
  const deviceId = String(params.deviceId ?? "").trim();
  const body = String(params.body ?? "").trim();
  const category = params.category;

  if (!deviceId) return { ok: false, error: "device_id_required" };
  if (!body || body.length < 5) return { ok: false, error: "body_too_short" };
  if (body.length > 4000) return { ok: false, error: "body_too_long" };
  if (!CATEGORIES.has(category)) return { ok: false, error: "invalid_category" };

  // Rate limit: max 5 per device / rolling 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("user_feedback")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) {
    return { ok: false, error: "rate_limited" };
  }

  const body_redacted = redactFeedbackText(body);
  const classified = classifyFeedbackHeuristic({
    categoryHint: category,
    redactedBody: body_redacted,
  });
  const fingerprint = clusterFingerprint({
    category: classified.category,
    redactedBody: body_redacted,
  });
  const voiceKey = uniqueVoiceKey({ deviceId, fingerprint });

  // Find or create cluster
  let cluster: UserFeedbackClusterRow | null = null;
  const { data: byFp } = await supabaseAdmin
    .from("user_feedback_clusters")
    .select("*")
    .eq("fingerprint", fingerprint)
    .maybeSingle();
  if (byFp) {
    cluster = byFp as UserFeedbackClusterRow;
  } else {
    const { data: openClusters } = await supabaseAdmin
      .from("user_feedback_clusters")
      .select("*")
      .eq("status", "open")
      .eq("category", classified.category)
      .order("last_seen_at", { ascending: false })
      .limit(30);
    for (const c of openClusters ?? []) {
      if (tokenOverlapRatio(c.summary, classified.summary) >= 0.6) {
        cluster = c as UserFeedbackClusterRow;
        break;
      }
    }
  }

  if (!cluster) {
    const { data: created, error: cErr } = await supabaseAdmin
      .from("user_feedback_clusters")
      .insert({
        fingerprint,
        title: clusterTitleFromSummary(
          classified.category,
          classified.summary,
          classified.severity
        ),
        summary: classified.summary,
        category: classified.category,
        severity: classified.severity,
        status: "open",
        report_count: 0,
        unique_reporter_count: 0,
        call_impact: classified.callImpact,
        safety_flag: classified.safetyFlag,
      })
      .select("*")
      .single();
    if (cErr || !created) {
      return {
        ok: false,
        error: "cluster_insert_failed",
        detail: cErr?.message,
      };
    }
    cluster = created as UserFeedbackClusterRow;
  }

  // Unique voice: has this device already counted for this fingerprint recently (30d)?
  const voiceSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: priorVoice } = await supabaseAdmin
    .from("user_feedback")
    .select("id", { count: "exact", head: true })
    .eq("unique_voice_key", voiceKey)
    .gte("created_at", voiceSince);
  const isNewVoice = (priorVoice ?? 0) === 0;

  const { data: row, error } = await supabaseAdmin
    .from("user_feedback")
    .insert({
      device_id: deviceId,
      user_id: params.userId ?? null,
      category,
      body_raw: body,
      body_redacted,
      page_context: params.pageContext?.trim() || null,
      status: classified.safetyFlag ? "pending" : "pending",
      ai_category: classified.category,
      ai_summary: classified.summary,
      ai_severity: classified.severity,
      ai_tags: classified.tags,
      call_impact: classified.callImpact,
      safety_flag: classified.safetyFlag,
      cluster_id: cluster.id,
      unique_voice_key: voiceKey,
      analysis_source: classified.analysisSource,
    })
    .select("id")
    .single();

  if (error || !row?.id) {
    return { ok: false, error: "feedback_insert_failed", detail: error?.message };
  }

  const nextSeverity =
    classified.severity === "critical" || cluster.severity === "critical"
      ? "critical"
      : classified.severity === "high" || cluster.severity === "high"
        ? "high"
        : classified.severity === "medium" || cluster.severity === "medium"
          ? "medium"
          : "low";

  await supabaseAdmin
    .from("user_feedback_clusters")
    .update({
      report_count: cluster.report_count + 1,
      unique_reporter_count: cluster.unique_reporter_count + (isNewVoice ? 1 : 0),
      severity: nextSeverity,
      call_impact:
        classified.callImpact === "likely" || cluster.call_impact === "likely"
          ? "likely"
          : classified.callImpact === "possible" || cluster.call_impact === "possible"
            ? "possible"
            : "none",
      safety_flag: cluster.safety_flag || classified.safetyFlag,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      summary: classified.summary,
    })
    .eq("id", cluster.id);

  if (classified.safetyFlag || classified.severity === "critical") {
    const notify = await notifySafetyFeedback({
      feedbackId: row.id,
      clusterId: cluster.id,
      summary: classified.summary,
      category: classified.category,
      severity: classified.severity,
    });
    if (notify.status === "sent") {
      await supabaseAdmin
        .from("user_feedback")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return {
    ok: true,
    feedbackId: row.id,
    safetyFlag: classified.safetyFlag,
    clusterId: cluster.id,
  };
}

export async function listFeedbackForAdmin(params: {
  status?: FeedbackStatus | "open" | "all";
  limit?: number;
}): Promise<UserFeedbackRow[]> {
  const limit = params.limit ?? 100;
  let q = supabaseAdmin
    .from("user_feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!params.status || params.status === "open") {
    q = q.in("status", ["pending", "held"]);
  } else if (params.status !== "all") {
    q = q.eq("status", params.status);
  }
  const { data } = await q;
  return (data ?? []) as UserFeedbackRow[];
}

export async function listClustersForAdmin(params?: {
  status?: string;
  limit?: number;
}): Promise<UserFeedbackClusterRow[]> {
  const limit = params?.limit ?? 50;
  let q = supabaseAdmin
    .from("user_feedback_clusters")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (!params?.status || params.status === "open") {
    q = q.in("status", ["open", "held", "accepted"]);
  } else if (params.status !== "all") {
    q = q.eq("status", params.status);
  }
  const { data } = await q;
  return (data ?? []) as UserFeedbackClusterRow[];
}

export async function setFeedbackStatus(params: {
  id: string;
  status: Exclude<FeedbackStatus, "pending">;
  adminNote?: string | null;
}): Promise<
  | { ok: true; feedback: UserFeedbackRow }
  | { ok: false; error: string; detail?: string }
> {
  // Safety items must not be dismissed without an explicit note
  const { data: existing } = await supabaseAdmin
    .from("user_feedback")
    .select("safety_flag,status")
    .eq("id", params.id)
    .maybeSingle();
  if (existing?.safety_flag && params.status === "dismissed") {
    if (!String(params.adminNote ?? "").trim()) {
      return {
        ok: false,
        error: "safety_requires_note",
        detail: "安全関連の却下には管理メモが必要です（AI単独却下禁止）",
      };
    }
  }

  const { data, error } = await supabaseAdmin
    .from("user_feedback")
    .update({
      status: params.status,
      admin_note: params.adminNote?.trim() || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "update_failed", detail: error?.message };
  }
  return { ok: true, feedback: data as UserFeedbackRow };
}

export async function setClusterStatus(params: {
  id: string;
  status: "accepted" | "held" | "resolved" | "dismissed" | "open";
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from("user_feedback_clusters")
    .update({
      status: params.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
