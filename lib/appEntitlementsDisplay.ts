import { topicSupportRankFromPlan } from "@/lib/billingCatalog";
import {
  formatClassSlotPlanLine,
  formatTopicPlanLine,
  topicSupportPlanName,
} from "@/lib/planTiers";

export type AppEntitlements = {
  plan: string;
  class_slots: number;
  can_create_classes: boolean;
  topic_plan: number;
  theme_pass: boolean;
};

export function summarizeAppEntitlements(ent: AppEntitlements | null | undefined) {
  if (!ent) {
    return {
      planLabel: "読み込み中…",
      classSlotsLabel: "—",
      topicLabel: "—",
      themeLabel: "—",
    };
  }

  const topicAmount =
    Number(ent.topic_plan ?? 0) > 0
      ? Number(ent.topic_plan)
      : topicSupportRankFromPlan(ent.plan);

  const hasTheme =
    Boolean(ent.theme_pass) || topicAmount > 0 || String(ent.plan ?? "").includes("topic");

  return {
    planLabel:
      Number(ent.class_slots ?? 1) >= 5
        ? "Slots 5"
        : Number(ent.class_slots ?? 1) >= 3
          ? "Slots 3"
          : "Free",
    classSlotsLabel: formatClassSlotPlanLine(Number(ent.class_slots ?? 1)),
    topicLabel: hasTheme
      ? formatTopicPlanLine(topicAmount > 0 ? topicAmount : 400)
      : "未加入",
    themeLabel: hasTheme
      ? topicSupportPlanName(topicAmount > 0 ? topicAmount : 400)
      : "なし",
  };
}
