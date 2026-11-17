import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fingerprintCharter,
  sanitizeCharterText,
} from "@/lib/marketing/operatingCharter/sanitize";
import { classifyCharterMemo } from "@/lib/marketing/operatingCharter/classify";
import {
  tierForImportance,
  type CharterCategory,
  type CharterImportance,
  type CharterMemoRow,
  type CharterPolicyRow,
  type CharterStatus,
} from "@/lib/marketing/operatingCharter/types";

async function appendRevision(params: {
  policyId: string;
  version: number;
  action: string;
  policy: Pick<
    CharterPolicyRow,
    "category" | "title" | "body" | "importance" | "status" | "priority_tier"
  >;
  changeNote?: string | null;
}): Promise<void> {
  await supabaseAdmin.from("ai_operating_policy_revisions").insert({
    policy_id: params.policyId,
    version: params.version,
    action: params.action,
    category: params.policy.category,
    title: params.policy.title,
    body: params.policy.body,
    importance: params.policy.importance,
    status: params.policy.status,
    priority_tier: params.policy.priority_tier,
    change_note: params.changeNote ?? null,
    actor: "admin",
  });
}

/**
 * Load active charter policies. Missing table / migration → empty (Phase 1–4 keep working).
 */
export async function listActivePolicies(): Promise<CharterPolicyRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ai_operating_policies")
      .select("*")
      .eq("status", "active")
      .order("priority_tier", { ascending: true })
      .order("importance", { ascending: true });
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return [];
      return [];
    }
    return (data ?? []) as CharterPolicyRow[];
  } catch {
    return [];
  }
}

export async function listPolicies(params?: {
  status?: CharterStatus | "open" | "all";
  limit?: number;
}): Promise<CharterPolicyRow[]> {
  const limit = params?.limit ?? 100;
  try {
    let q = supabaseAdmin
      .from("ai_operating_policies")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (!params?.status || params.status === "open") {
      q = q.in("status", ["active", "pending_approval", "idea_unadopted"]);
    } else if (params.status !== "all") {
      q = q.eq("status", params.status);
    }
    const { data, error } = await q;
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as CharterPolicyRow[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/does not exist|schema cache/i.test(msg)) return [];
    throw e;
  }
}

export async function listMemos(limit = 40): Promise<CharterMemoRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ai_operating_policy_memos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as CharterMemoRow[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/does not exist|schema cache/i.test(msg)) return [];
    throw e;
  }
}

export async function createPolicyManual(params: {
  category: CharterCategory;
  title: string;
  body: string;
  importance: CharterImportance;
  status?: Extract<CharterStatus, "active" | "idea_unadopted" | "pending_approval">;
  changeNote?: string;
}): Promise<
  | { ok: true; policy: CharterPolicyRow }
  | { ok: false; error: string; detail?: string }
> {
  const scrub = sanitizeCharterText(params.body);
  if (scrub.blockedSecret) {
    return { ok: false, error: "secrets_not_allowed" };
  }
  const titleScrub = sanitizeCharterText(params.title);
  const status = params.status ?? "active";
  const tier = tierForImportance(params.importance, params.category);
  const fingerprint = fingerprintCharter({
    category: params.category,
    title: titleScrub.text,
    body: scrub.text,
  });

  const row = {
    category: params.category,
    title: titleScrub.text,
    body: scrub.text,
    importance: params.importance,
    status,
    priority_tier: tier,
    source: "manual" as const,
    version: 1,
    fingerprint,
    activated_at: status === "active" ? new Date().toISOString() : null,
  };

  const { data, error } = await supabaseAdmin
    .from("ai_operating_policies")
    .insert(row)
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, error: "policy_insert_failed", detail: error?.message };
  }
  await appendRevision({
    policyId: data.id,
    version: 1,
    action: "create",
    policy: data as CharterPolicyRow,
    changeNote: params.changeNote ?? null,
  });
  return { ok: true, policy: data as CharterPolicyRow };
}

export async function submitCharterMemo(rawText: string): Promise<
  | {
      ok: true;
      memo: CharterMemoRow;
      classification: ReturnType<typeof classifyCharterMemo>;
    }
  | { ok: false; error: string; detail?: string }
> {
  const scrub = sanitizeCharterText(rawText);
  if (!scrub.text || scrub.text.length < 4) {
    return { ok: false, error: "memo_too_short" };
  }
  if (scrub.blockedSecret) {
    return { ok: false, error: "secrets_not_allowed" };
  }

  const active = await listActivePolicies();
  const classification = classifyCharterMemo({
    sanitizedText: scrub.text,
    activePolicies: active,
  });

  let status: CharterMemoRow["status"] = "classified";
  if (classification.conflicts.length || classification.suggestedStatus === "pending_approval") {
    status = "needs_approval";
  }

  const { data, error } = await supabaseAdmin
    .from("ai_operating_policy_memos")
    .insert({
      raw_text: String(rawText).slice(0, 8000),
      sanitized_text: scrub.text,
      ai_category: classification.category,
      ai_title: classification.title,
      ai_importance: classification.importance,
      duplicate_of_policy_id: classification.duplicateOf?.id ?? null,
      conflict_with_policy_ids: classification.conflicts.map((c) => c.id),
      status,
      analysis_notes: [
        ...classification.notes,
        ...(scrub.injectionFlags.length
          ? [`injection_filtered:${scrub.injectionFlags.length}`]
          : []),
      ].join("; "),
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: "memo_insert_failed", detail: error?.message };
  }

  // Auto-promote safe ideas as idea_unadopted (not formal policy)
  if (
    status === "classified" &&
    classification.suggestedStatus === "idea_unadopted" &&
    !classification.duplicateOf
  ) {
    const created = await createPolicyManual({
      category: classification.category,
      title: classification.title,
      body: scrub.text,
      importance: classification.importance,
      status: "idea_unadopted",
      changeNote: `from memo ${data.id}`,
    });
    if (created.ok) {
      await supabaseAdmin
        .from("ai_operating_policy_memos")
        .update({
          status: "promoted",
          resulting_policy_id: created.policy.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      data.status = "promoted";
      data.resulting_policy_id = created.policy.id;
    }
  }

  return {
    ok: true,
    memo: data as CharterMemoRow,
    classification,
  };
}

export async function setPolicyStatus(params: {
  id: string;
  status: Extract<CharterStatus, "active" | "inactive" | "idea_unadopted" | "archived">;
  changeNote?: string;
}): Promise<
  | { ok: true; policy: CharterPolicyRow }
  | { ok: false; error: string; detail?: string }
> {
  const { data: existing } = await supabaseAdmin
    .from("ai_operating_policies")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "not_found" };

  const nextVersion = Number(existing.version) + 1;
  const action =
    params.status === "active" && existing.status !== "active"
      ? "reactivate"
      : params.status === "inactive"
        ? "deactivate"
        : "edit";

  const { data, error } = await supabaseAdmin
    .from("ai_operating_policies")
    .update({
      status: params.status,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      activated_at:
        params.status === "active" ? new Date().toISOString() : existing.activated_at,
      deactivated_at:
        params.status === "inactive" || params.status === "archived"
          ? new Date().toISOString()
          : null,
    })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, error: "status_update_failed", detail: error?.message };
  }
  await appendRevision({
    policyId: params.id,
    version: nextVersion,
    action,
    policy: data as CharterPolicyRow,
    changeNote: params.changeNote ?? null,
  });
  return { ok: true, policy: data as CharterPolicyRow };
}

export async function approveMemoAsPolicy(params: {
  memoId: string;
  activate: boolean;
}): Promise<
  | { ok: true; policy: CharterPolicyRow }
  | { ok: false; error: string; detail?: string }
> {
  const { data: memo } = await supabaseAdmin
    .from("ai_operating_policy_memos")
    .select("*")
    .eq("id", params.memoId)
    .maybeSingle();
  if (!memo) return { ok: false, error: "memo_not_found" };

  const created = await createPolicyManual({
    category: (memo.ai_category as CharterCategory) || "idea",
    title: String(memo.ai_title || "メモから昇格"),
    body: String(memo.sanitized_text),
    importance: (memo.ai_importance as CharterImportance) || "medium",
    status: params.activate ? "active" : "idea_unadopted",
    changeNote: `approved memo ${params.memoId}`,
  });
  if (!created.ok) return created;

  await supabaseAdmin
    .from("ai_operating_policy_memos")
    .update({
      status: "promoted",
      resulting_policy_id: created.policy.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.memoId);

  await appendRevision({
    policyId: created.policy.id,
    version: created.policy.version,
    action: "approve",
    policy: created.policy,
    changeNote: `memo ${params.memoId}`,
  });

  return created;
}

export async function updatePolicy(params: {
  id: string;
  title?: string;
  body?: string;
  category?: CharterCategory;
  importance?: CharterImportance;
  changeNote?: string;
}): Promise<
  | { ok: true; policy: CharterPolicyRow }
  | { ok: false; error: string; detail?: string }
> {
  const { data: existing } = await supabaseAdmin
    .from("ai_operating_policies")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "not_found" };

  const titleScrub = sanitizeCharterText(params.title ?? existing.title);
  const bodyScrub = sanitizeCharterText(params.body ?? existing.body);
  if (bodyScrub.blockedSecret || titleScrub.blockedSecret) {
    return { ok: false, error: "secrets_not_allowed" };
  }
  const category = params.category ?? (existing.category as CharterCategory);
  const importance =
    params.importance ?? (existing.importance as CharterImportance);
  const nextVersion = Number(existing.version) + 1;
  const fingerprint = fingerprintCharter({
    category,
    title: titleScrub.text,
    body: bodyScrub.text,
  });

  const { data, error } = await supabaseAdmin
    .from("ai_operating_policies")
    .update({
      title: titleScrub.text,
      body: bodyScrub.text,
      category,
      importance,
      priority_tier: tierForImportance(importance, category),
      version: nextVersion,
      fingerprint,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, error: "policy_update_failed", detail: error?.message };
  }
  await appendRevision({
    policyId: params.id,
    version: nextVersion,
    action: "edit",
    policy: data as CharterPolicyRow,
    changeNote: params.changeNote ?? null,
  });
  return { ok: true, policy: data as CharterPolicyRow };
}

export async function restorePolicyVersion(params: {
  policyId: string;
  version: number;
}): Promise<
  | { ok: true; policy: CharterPolicyRow }
  | { ok: false; error: string; detail?: string }
> {
  const { data: rev } = await supabaseAdmin
    .from("ai_operating_policy_revisions")
    .select("*")
    .eq("policy_id", params.policyId)
    .eq("version", params.version)
    .maybeSingle();
  if (!rev) return { ok: false, error: "revision_not_found" };

  const { data: existing } = await supabaseAdmin
    .from("ai_operating_policies")
    .select("*")
    .eq("id", params.policyId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "not_found" };

  const nextVersion = Number(existing.version) + 1;
  const { data, error } = await supabaseAdmin
    .from("ai_operating_policies")
    .update({
      category: rev.category,
      title: rev.title,
      body: rev.body,
      importance: rev.importance,
      status: rev.status === "active" ? "active" : existing.status,
      priority_tier: rev.priority_tier,
      version: nextVersion,
      fingerprint: fingerprintCharter({
        category: rev.category,
        title: rev.title,
        body: rev.body,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.policyId)
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, error: "restore_failed", detail: error?.message };
  }
  await appendRevision({
    policyId: params.policyId,
    version: nextVersion,
    action: "restore",
    policy: data as CharterPolicyRow,
    changeNote: `restored from v${params.version}`,
  });
  return { ok: true, policy: data as CharterPolicyRow };
}

export async function listRevisions(policyId: string) {
  const { data } = await supabaseAdmin
    .from("ai_operating_policy_revisions")
    .select("*")
    .eq("policy_id", policyId)
    .order("version", { ascending: false })
    .limit(50);
  return data ?? [];
}
