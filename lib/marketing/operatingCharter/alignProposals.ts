import type { ProposalDraft } from "@/lib/marketing/proposals";
import {
  checkTextAgainstCharter,
} from "@/lib/marketing/operatingCharter/compliance";
import type { CharterPolicyRow } from "@/lib/marketing/operatingCharter/types";
import { CHARTER_CATEGORY_LABELS } from "@/lib/marketing/operatingCharter/types";

/**
 * Annotate improvement drafts with charter alignment.
 * Conflicts → needs_review (never auto-applied; keep pending for operator).
 */
export function alignProposalsWithCharter(params: {
  drafts: ProposalDraft[];
  policies: CharterPolicyRow[];
}): ProposalDraft[] {
  const { policies } = params;
  const policyIds = policies.map((p) => p.id);
  const relatedSummary = policies
    .filter((p) => p.priority_tier <= 3)
    .slice(0, 6)
    .map(
      (p) =>
        `- T${p.priority_tier} ${CHARTER_CATEGORY_LABELS[p.category] ?? p.category}/v${p.version}: ${p.title}`
    )
    .join("\n");

  return params.drafts.map((draft) => {
    const blob = `${draft.title}\n${draft.summary}\n${draft.detail_markdown ?? ""}\n${draft.image_prompt ?? ""}`;
    const compliance = checkTextAgainstCharter({ text: blob, policies });
    const aligned =
      compliance.status === "needs_review"
        ? "needs_review"
        : policies.length
          ? "aligned"
          : "no_active_charter";

    const alignmentBlock = [
      "",
      "### 運営憲章との整合",
      "",
      `- 判定: ${aligned}`,
      compliance.conflicts.length
        ? `- 矛盾候補: ${compliance.conflicts.map((c) => c.title).join(" / ")}`
        : "- 矛盾候補: なし",
      relatedSummary ? `- 参照方針:\n${relatedSummary}` : "- 参照方針: （有効方針なし）",
      "",
      "> 方針変更の提案は可。正式な方針変更・UI/画像の本番適用は運営者承認必須。",
    ].join("\n");

    return {
      ...draft,
      charter_alignment: [
        aligned,
        ...compliance.conflicts.map((c) => `${c.title}:${c.reason}`),
      ].join("; "),
      charter_policy_ids: [
        ...new Set([...policyIds, ...compliance.referencedPolicyIds]),
      ],
      detail_markdown: `${draft.detail_markdown ?? ""}${alignmentBlock}`,
    };
  });
}
