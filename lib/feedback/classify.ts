import type { FeedbackCategory, FeedbackSeverity, CallImpact } from "@/lib/feedback/types";

export type ClassificationResult = {
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  summary: string;
  tags: string[];
  callImpact: CallImpact;
  safetyFlag: boolean;
  analysisSource: "heuristic";
};

const SAFETY_RE =
  /危害|暴力|脅迫|脅迫|自殺|自傷|性的|わいせつ|痴漢|レイプ|児童|未成年|個人情報.*(晒|公開)|詐欺|恐喝|ハラスメント|嫌がらせ|ストーカー/i;
const BUG_RE =
  /バグ|不具合|落ちる|クラッシュ|エラー|繋がらない|つながらない|切断|フリーズ|真っ白|白画面|動かない|起動しない|音声が|マイク|スピーカー/i;
const CALL_RE = /通話|マッチ|待機|ロビー|ランダム通話|接続|切断|聞こえ/i;
const UX_RE = /わかりにくい|使いにくい|導線|ボタン|画面|デザイン|イラスト|キャッチ|UI|UX|見え/i;
const REQUEST_RE = /ほしい|欲しい|追加して|機能|要望|してほしい|できませんか|できないか/i;

/**
 * Heuristic classification on redacted text only.
 * Safety matches always force human review (safetyFlag) and never auto-dismiss.
 */
export function classifyFeedbackHeuristic(params: {
  categoryHint: FeedbackCategory;
  redactedBody: string;
}): ClassificationResult {
  const text = params.redactedBody;
  const tags: string[] = [];
  let category = params.categoryHint;
  let severity: FeedbackSeverity = "medium";
  let callImpact: CallImpact = "none";
  let safetyFlag = params.categoryHint === "safety";

  if (SAFETY_RE.test(text)) {
    safetyFlag = true;
    category = "safety";
    severity = "critical";
    tags.push("safety_keyword");
  } else if (BUG_RE.test(text)) {
    category = category === "other" ? "bug" : category;
    tags.push("bug_keyword");
    if (CALL_RE.test(text)) {
      callImpact = "likely";
      severity = "high";
      tags.push("call_path");
    }
  } else if (REQUEST_RE.test(text)) {
    category = category === "other" ? "request" : category;
    tags.push("request_keyword");
    severity = "low";
  } else if (UX_RE.test(text)) {
    category = category === "other" ? "ux" : category;
    tags.push("ux_keyword");
  }

  if (!safetyFlag && CALL_RE.test(text)) {
    callImpact = callImpact === "none" ? "possible" : callImpact;
    if (severity === "medium" && category === "bug") severity = "high";
    tags.push("call_mention");
  }

  if (safetyFlag && severity !== "critical") severity = "critical";

  const summary =
    text.length <= 120 ? text : `${text.slice(0, 117)}…`;

  return {
    category,
    severity,
    summary,
    tags: [...new Set(tags)],
    callImpact,
    safetyFlag,
    analysisSource: "heuristic",
  };
}

export function priorityScore(params: {
  severity: FeedbackSeverity;
  uniqueReporterCount: number;
  callImpact: CallImpact;
  safetyFlag: boolean;
}): number {
  let score = 0;
  if (params.safetyFlag) score += 100;
  score +=
    params.severity === "critical"
      ? 50
      : params.severity === "high"
        ? 30
        : params.severity === "medium"
          ? 15
          : 5;
  score += Math.min(40, params.uniqueReporterCount * 8);
  score +=
    params.callImpact === "likely" ? 20 : params.callImpact === "possible" ? 10 : 0;
  return score;
}
