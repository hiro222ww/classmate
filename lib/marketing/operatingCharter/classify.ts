import type {
  CharterCategory,
  CharterImportance,
  CharterPolicyRow,
} from "@/lib/marketing/operatingCharter/types";
import { jaccard, tokenSet } from "@/lib/marketing/operatingCharter/sanitize";
import { tierForImportance } from "@/lib/marketing/operatingCharter/types";

export type MemoClassification = {
  category: CharterCategory;
  title: string;
  importance: CharterImportance;
  priorityTier: number;
  duplicateOf: CharterPolicyRow | null;
  conflicts: CharterPolicyRow[];
  notes: string[];
  suggestedStatus: "idea_unadopted" | "pending_approval" | "active_candidate";
};

const CATEGORY_HINTS: Array<{ cat: CharterCategory; re: RegExp }> = [
  { cat: "idea", re: /試したい|アイデア|実験|仮説|やってみたい/i },
  { cat: "prohibitions", re: /禁止|やってはいけない|法令|個人情報|安全|ハラスメント/i },
  { cat: "philosophy", re: /理念|ミッション|大切に|世界観の根|なぜ作/i },
  { cat: "audience", re: /想定ユーザー|ターゲット|18歳|同年代|誰向け/i },
  { cat: "brand_world", re: /ブランド|トーン|空気感|世界観/i },
  { cat: "sns", re: /SNS|投稿|X\b|Twitter|宣伝/i },
  { cat: "ui_ux", re: /UI|UX|導線|ボタン|画面/i },
  { cat: "home_visual", re: /ホーム|ヒーロー|イラスト|画像|ビジュアル/i },
  { cat: "kpi", re: /KPI|登録率|継続|通話開始|指標/i },
];

const CONFLICT_NEGATION =
  /禁止|やめ|しない|避ける|反対|やめるべき|認めない|NG/i;

/**
 * Heuristic classify for operator memos (no paid API by default).
 * Conflicts with high-tier active policies → needs approval, never silent overwrite.
 */
export function classifyCharterMemo(params: {
  sanitizedText: string;
  activePolicies: CharterPolicyRow[];
}): MemoClassification {
  const text = params.sanitizedText;
  const notes: string[] = [];
  let category: CharterCategory = "idea";
  for (const h of CATEGORY_HINTS) {
    if (h.re.test(text)) {
      category = h.cat;
      break;
    }
  }

  const importance: CharterImportance =
    category === "prohibitions" || /法令|個人情報|安全/.test(text)
      ? "critical"
      : category === "philosophy"
        ? "high"
        : category === "idea"
          ? "low"
          : "medium";

  const title =
    text.length <= 40
      ? text
      : `${text.slice(0, 37)}…`;

  const memoTokens = tokenSet(text);
  let duplicateOf: CharterPolicyRow | null = null;
  const conflicts: CharterPolicyRow[] = [];

  for (const p of params.activePolicies) {
    const sim = jaccard(memoTokens, tokenSet(`${p.title} ${p.body}`));
    if (sim >= 0.55) {
      duplicateOf = p;
      notes.push(`既存方針「${p.title}」と類似 (jaccard=${sim.toFixed(2)})`);
    }
    // Conflict: memo negates an important active policy topic with overlapping tokens
    if (
      p.priority_tier <= 3 &&
      sim >= 0.12 &&
      CONFLICT_NEGATION.test(text) &&
      !CONFLICT_NEGATION.test(p.body)
    ) {
      conflicts.push(p);
      notes.push(`重要方針「${p.title}」との矛盾の可能性`);
    }
    if (
      p.priority_tier <= 3 &&
      sim >= 0.12 &&
      CONFLICT_NEGATION.test(p.body) &&
      !CONFLICT_NEGATION.test(text) &&
      /推奨|積極的|増や|必須/.test(text)
    ) {
      conflicts.push(p);
      notes.push(`禁止事項「${p.title}」に反する提案の可能性`);
    }
  }

  let suggestedStatus: MemoClassification["suggestedStatus"] = "idea_unadopted";
  if (conflicts.length) {
    suggestedStatus = "pending_approval";
    notes.push("重要方針との矛盾候補のため自動反映せず承認待ち");
  } else if (category === "idea" || importance === "low") {
    suggestedStatus = "idea_unadopted";
  } else {
    suggestedStatus = "active_candidate";
  }

  return {
    category,
    title,
    importance,
    priorityTier: tierForImportance(importance, category),
    duplicateOf,
    conflicts,
    notes,
    suggestedStatus,
  };
}
