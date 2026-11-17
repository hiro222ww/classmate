export type CharterCategory =
  | "philosophy"
  | "audience"
  | "brand_world"
  | "sns"
  | "ui_ux"
  | "home_visual"
  | "kpi"
  | "prohibitions"
  | "idea";

export type CharterImportance = "critical" | "high" | "medium" | "low";

export type CharterStatus =
  | "active"
  | "inactive"
  | "idea_unadopted"
  | "pending_approval"
  | "archived";

export type CharterPolicyRow = {
  id: string;
  category: CharterCategory;
  title: string;
  body: string;
  importance: CharterImportance;
  status: CharterStatus;
  priority_tier: number;
  source: "manual" | "memo_ai" | "ai_proposal";
  version: number;
  fingerprint: string;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  deactivated_at: string | null;
};

export type CharterMemoRow = {
  id: string;
  raw_text: string;
  sanitized_text: string;
  ai_category: CharterCategory | null;
  ai_title: string | null;
  ai_importance: CharterImportance | null;
  duplicate_of_policy_id: string | null;
  conflict_with_policy_ids: string[];
  status: "inbox" | "classified" | "promoted" | "rejected" | "needs_approval";
  analysis_notes: string | null;
  resulting_policy_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CharterComplianceResult = {
  status: "ok" | "needs_review";
  conflicts: Array<{ policyId: string; title: string; reason: string }>;
  referencedPolicyIds: string[];
};

export const CHARTER_CATEGORY_LABELS: Record<CharterCategory, string> = {
  philosophy: "サービス理念",
  audience: "想定ユーザー",
  brand_world: "ブランド世界観",
  sns: "SNS運用方針",
  ui_ux: "UI・UX方針",
  home_visual: "ホーム画像・イラスト方針",
  kpi: "集客・継続KPI",
  prohibitions: "運営上の禁止事項",
  idea: "試したいアイデア",
};

/** Priority tiers 1–5 as specified by operator. */
export function tierForImportance(
  importance: CharterImportance,
  category: CharterCategory
): number {
  if (importance === "critical" || category === "prohibitions") return 1;
  if (category === "philosophy" && importance === "high") return 2;
  if (importance === "high") return 3;
  if (category === "idea") return 5;
  return 4;
}
