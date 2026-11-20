import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { MarketingPostType } from "@/lib/marketing/types";

export type StrategyGuidance = {
  preferredTypes?: MarketingPostType[];
  themeHints?: string[];
  catchcopyHints?: string[];
  ctaHints?: string[];
  empathyToPromoRatio?: string;
  preferredHoursJst?: number[];
  avoidTopics?: string[];
  notes?: string[];
};

export type StrategyVersionRow = {
  id: string;
  version: number;
  label: string;
  status: "draft" | "active" | "inactive" | "archived";
  source_report_id: string | null;
  guidance: StrategyGuidance;
  prompt_addon: string;
  notes: string | null;
  created_at: string;
  activated_at: string | null;
  deactivated_at: string | null;
};

export async function getActiveStrategy(): Promise<StrategyVersionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("marketing_strategy_versions")
    .select("*")
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return null;
  return data as StrategyVersionRow;
}

export function buildPromptAddonFromGuidance(guidance: StrategyGuidance): string {
  const lines: string[] = ["【適用中の改善方針 — 断定ではなく仮説として扱う】"];
  if (guidance.preferredTypes?.length) {
    lines.push(`優先投稿タイプ: ${guidance.preferredTypes.join(", ")}`);
  }
  if (guidance.empathyToPromoRatio) {
    lines.push(`共感/宣伝バランス: ${guidance.empathyToPromoRatio}`);
  }
  if (guidance.themeHints?.length) {
    lines.push(`テーマ案: ${guidance.themeHints.join(" / ")}`);
  }
  if (guidance.catchcopyHints?.length) {
    lines.push(`言い回しの方向: ${guidance.catchcopyHints.join(" / ")}`);
  }
  if (guidance.ctaHints?.length) {
    lines.push(`CTAの方向: ${guidance.ctaHints.join(" / ")}`);
  }
  if (guidance.preferredHoursJst?.length) {
    lines.push(
      `投稿時間の仮説(JST): ${guidance.preferredHoursJst.map((h) => `${h}時台`).join(", ")}（本文には書かない）`
    );
  }
  if (guidance.avoidTopics?.length) {
    lines.push(`避ける: ${guidance.avoidTopics.join(", ")}`);
  }
  if (guidance.notes?.length) {
    lines.push(...guidance.notes.map((n) => `注: ${n}`));
  }
  lines.push("サンプルが少ない場合は上記を強く押し出さないこと。");
  return lines.join("\n");
}

export async function listStrategyVersions(limit = 30): Promise<StrategyVersionRow[]> {
  const { data } = await supabaseAdmin
    .from("marketing_strategy_versions")
    .select("*")
    .order("version", { ascending: false })
    .limit(limit);
  return (data ?? []) as StrategyVersionRow[];
}

export async function createStrategyVersion(params: {
  label: string;
  guidance: StrategyGuidance;
  promptAddon?: string;
  sourceReportId?: string | null;
  notes?: string | null;
  activate?: boolean;
}): Promise<
  | { ok: true; strategy: StrategyVersionRow }
  | { ok: false; error: string; detail?: string }
> {
  const { data: latest } = await supabaseAdmin
    .from("marketing_strategy_versions")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = Number(latest?.version ?? 0) + 1;
  const prompt_addon =
    params.promptAddon?.trim() ||
    buildPromptAddonFromGuidance(params.guidance);

  if (params.activate) {
    await supabaseAdmin
      .from("marketing_strategy_versions")
      .update({
        status: "inactive",
        deactivated_at: new Date().toISOString(),
      })
      .eq("status", "active");
  }

  const { data, error } = await supabaseAdmin
    .from("marketing_strategy_versions")
    .insert({
      version,
      label: params.label,
      status: params.activate ? "active" : "draft",
      source_report_id: params.sourceReportId ?? null,
      guidance: params.guidance,
      prompt_addon,
      notes: params.notes ?? null,
      activated_at: params.activate ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: "strategy_insert_failed", detail: error?.message };
  }
  return { ok: true, strategy: data as StrategyVersionRow };
}

export async function activateStrategyVersion(
  id: string
): Promise<
  | { ok: true; strategy: StrategyVersionRow }
  | { ok: false; error: string; detail?: string }
> {
  await supabaseAdmin
    .from("marketing_strategy_versions")
    .update({
      status: "inactive",
      deactivated_at: new Date().toISOString(),
    })
    .eq("status", "active");

  const { data, error } = await supabaseAdmin
    .from("marketing_strategy_versions")
    .update({
      status: "active",
      activated_at: new Date().toISOString(),
      deactivated_at: null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: "strategy_activate_failed", detail: error?.message };
  }
  return { ok: true, strategy: data as StrategyVersionRow };
}

export async function deactivateActiveStrategy(): Promise<
  | { ok: true }
  | { ok: false; error: string; detail?: string }
> {
  const { error } = await supabaseAdmin
    .from("marketing_strategy_versions")
    .update({
      status: "inactive",
      deactivated_at: new Date().toISOString(),
    })
    .eq("status", "active");
  if (error) return { ok: false, error: "strategy_deactivate_failed", detail: error.message };
  return { ok: true };
}
