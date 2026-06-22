import type { GenderRestriction } from "@/lib/genderRestriction";

export type TopicPublicRow = {
  topic_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
  monthly_price: number;
  gender_restriction?: GenderRestriction;
  is_archived?: boolean;
  is_active?: boolean;
  is_paid?: boolean;
  display_order?: number;
  accepting_new_users?: boolean;
  badge_label?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const TOPIC_PUBLIC_SELECT =
  "topic_key,title,description,is_sensitive,min_age,monthly_price,gender_restriction,is_archived,is_active,is_paid,display_order,accepting_new_users,badge_label,created_at,updated_at";

export const THEME_PLAN_TOPICS_HEADING = "テーマプランで使えるテーマ";

export const THEME_PLAN_TOPICS_INTRO =
  "現在、以下のテーマクラスに参加できます。";

export const THEME_PLAN_TOPICS_SAME_ACCESS =
  "現在はどの応援プランでも利用できるテーマは同じです。";

export const THEME_PLAN_TOPICS_CHANGE_NOTE =
  "テーマは利用状況を見ながら追加・変更される場合があります。";

export const TOPIC_RECRUITMENT_CLOSED_BADGE = "受付停止中";

export function genderRestrictionAdminLabel(v: string | null | undefined) {
  if (v === "male") return "男性のみ";
  if (v === "female") return "女性のみ";
  return "制限なし";
}

export function compareTopicsByDisplayOrder(
  a: Pick<TopicPublicRow, "display_order" | "created_at" | "title">,
  b: Pick<TopicPublicRow, "display_order" | "created_at" | "title">
) {
  const orderA = Number(a.display_order ?? 0);
  const orderB = Number(b.display_order ?? 0);
  if (orderA !== orderB) return orderA - orderB;

  const createdA = String(a.created_at ?? "");
  const createdB = String(b.created_at ?? "");
  if (createdA !== createdB) return createdA.localeCompare(createdB);

  return String(a.title ?? "").localeCompare(String(b.title ?? ""), "ja");
}

export function isTopicVisibleOnBillingPage(topic: TopicPublicRow) {
  if (topic.is_archived) return false;
  return topic.is_active !== false;
}

export function isTopicAcceptingNewUsers(topic: TopicPublicRow) {
  return topic.accepting_new_users !== false;
}

export function topicBillingBadgeLabel(topic: TopicPublicRow) {
  const custom = String(topic.badge_label ?? "").trim();
  if (custom) return custom;
  if (!isTopicAcceptingNewUsers(topic)) return TOPIC_RECRUITMENT_CLOSED_BADGE;
  return null;
}
