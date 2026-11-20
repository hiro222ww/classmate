export const MARKETING_CHANNELS = ["x", "instagram", "tiktok", "manual"] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const MARKETING_POST_TYPES = ["empathy", "invite", "intro"] as const;
export type MarketingPostType = (typeof MARKETING_POST_TYPES)[number];

export const MARKETING_POST_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "failed",
] as const;
export type MarketingPostStatus = (typeof MARKETING_POST_STATUSES)[number];

export const MARKETING_POST_TYPE_LABELS: Record<MarketingPostType, string> = {
  empathy: "共感型",
  invite: "参加促進型",
  intro: "サービス紹介型",
};

export const MARKETING_STATUS_LABELS: Record<MarketingPostStatus, string> = {
  draft: "下書き",
  approved: "承認済み",
  scheduled: "予約済み",
  published: "公開済み",
  rejected: "却下",
  failed: "失敗",
};

export type GeneratedPostDraft = {
  post_type: MarketingPostType;
  body_text: string;
  purpose: string;
  target_audience: string;
  cta: string;
};

export type MarketingPostRow = {
  id: string;
  campaign_id: string | null;
  channel: MarketingChannel;
  post_type: MarketingPostType;
  status: MarketingPostStatus;
  body_text: string;
  purpose: string | null;
  target_audience: string | null;
  cta: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  tracking_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  external_post_id: string | null;
  external_status?: "scheduled" | "sent" | "error" | null;
  external_due_at?: string | null;
  publish_attempts?: number | null;
  publish_error: string | null;
  generation_source: "openai" | "template_fallback" | "manual";
  similarity_score: number | null;
  model_name: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  estimated_cost_usd: number | null;
  ai_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export function isMarketingPostType(v: unknown): v is MarketingPostType {
  return MARKETING_POST_TYPES.includes(String(v ?? "") as MarketingPostType);
}

export function isMarketingPostStatus(v: unknown): v is MarketingPostStatus {
  return MARKETING_POST_STATUSES.includes(String(v ?? "") as MarketingPostStatus);
}
