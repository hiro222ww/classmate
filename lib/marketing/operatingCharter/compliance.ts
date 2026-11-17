import type {
  CharterComplianceResult,
  CharterPolicyRow,
} from "@/lib/marketing/operatingCharter/types";
import { jaccard, tokenSet } from "@/lib/marketing/operatingCharter/sanitize";

const FORBIDDEN_HINTS =
  /出会い目的|オフ会誘導|連絡先交換|年齢詐称|すぐ友達ができる|今すぐ登録|3人集まらないと/i;

/**
 * Post-generation compliance check against active charter (tiers 1–3 weighted).
 * Does not auto-apply fixes — returns needs_review on conflict.
 */
export function checkTextAgainstCharter(params: {
  text: string;
  policies: CharterPolicyRow[];
}): CharterComplianceResult {
  const text = String(params.text ?? "");
  const conflicts: CharterComplianceResult["conflicts"] = [];
  const referenced: string[] = [];
  const textTokens = tokenSet(text);

  for (const p of params.policies) {
    if (p.status !== "active") continue;
    const overlap = jaccard(textTokens, tokenSet(`${p.title} ${p.body}`));
    if (overlap >= 0.12) referenced.push(p.id);

    if (p.priority_tier <= 2 && /禁止|しない|避ける|NG/.test(p.body)) {
      // Extract short banned phrases heuristically from prohibition body
      const bannedBits = p.body
        .split(/[、。・\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4 && s.length <= 40);
      for (const bit of bannedBits) {
        if (text.includes(bit.replace(/^禁止[:：]?\s*/, ""))) {
          conflicts.push({
            policyId: p.id,
            title: p.title,
            reason: `禁止方針「${p.title}」の表現に抵触する可能性`,
          });
        }
      }
    }
  }

  if (FORBIDDEN_HINTS.test(text)) {
    conflicts.push({
      policyId: "builtin-safety",
      title: "組み込み安全・正確性ルール",
      reason: "法令・安全・誇大表現に抵触する可能性のあるフレーズ",
    });
  }

  // Dedup
  const seen = new Set<string>();
  const uniq = conflicts.filter((c) => {
    const k = `${c.policyId}:${c.reason}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    status: uniq.length ? "needs_review" : "ok",
    conflicts: uniq,
    referencedPolicyIds: [...new Set(referenced)],
  };
}

export function charterSnapshotForReport(policies: CharterPolicyRow[]) {
  return {
    generatedAt: new Date().toISOString(),
    priorityOrder: [
      "1_laws_safety_privacy",
      "2_approved_philosophy_prohibitions",
      "3_approved_specific_policies",
      "4_user_feedback_and_measured_data",
      "5_ai_hypotheses",
    ],
    active: policies.map((p) => ({
      id: p.id,
      category: p.category,
      title: p.title,
      importance: p.importance,
      priority_tier: p.priority_tier,
      version: p.version,
      bodyPreview: p.body.slice(0, 160),
    })),
  };
}
