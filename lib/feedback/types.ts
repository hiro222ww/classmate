export type FeedbackCategory = "bug" | "request" | "ux" | "safety" | "other";
export type FeedbackSeverity = "critical" | "high" | "medium" | "low";
export type CallImpact = "none" | "possible" | "likely";
export type FeedbackStatus =
  | "pending"
  | "accepted"
  | "held"
  | "resolved"
  | "dismissed";
export type ClusterStatus =
  | "open"
  | "accepted"
  | "held"
  | "resolved"
  | "dismissed";

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "不具合",
  request: "要望",
  ux: "使いやすさ",
  safety: "安全・通報関連",
  other: "その他",
};

export type UserFeedbackRow = {
  id: string;
  device_id: string;
  user_id: string | null;
  category: FeedbackCategory;
  body_raw: string;
  body_redacted: string;
  page_context: string | null;
  status: FeedbackStatus;
  ai_category: FeedbackCategory | null;
  ai_summary: string | null;
  ai_severity: FeedbackSeverity | null;
  ai_tags: string[];
  call_impact: CallImpact;
  safety_flag: boolean;
  cluster_id: string | null;
  unique_voice_key: string;
  analysis_source: string;
  notified_at: string | null;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserFeedbackClusterRow = {
  id: string;
  fingerprint: string;
  title: string;
  summary: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  status: ClusterStatus;
  report_count: number;
  unique_reporter_count: number;
  call_impact: CallImpact;
  safety_flag: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

/** Safe aggregate for weekly AI — no raw text, no device ids. */
export type FeedbackWeeklySnapshot = {
  days: number;
  totalReports: number;
  uniqueVoices: number;
  byCategory: Array<{ category: string; reports: number; uniqueVoices: number }>;
  openClusters: Array<{
    title: string;
    category: string;
    severity: string;
    uniqueReporterCount: number;
    reportCount: number;
    callImpact: string;
    safetyFlag: boolean;
  }>;
  safetyOpenCount: number;
  notes: string[];
};
