import {
  contactRiskWarningMessage,
  moderateUserText,
  scanContactRisk,
  type ContentModerationDecision,
} from "@/lib/contentModeration";
import { getEffectiveAgeMode } from "@/lib/agePolicy";

/**
 * Chat moderation that allows plain http(s) URLs (for linkify),
 * while still blocking contact-exchange patterns.
 */
export async function moderateChatText(
  text: string
): Promise<ContentModerationDecision> {
  const hits = scanContactRisk(text).filter((hit) => hit.code !== "url");
  if (hits.length === 0) return { ok: true };

  const message = contactRiskWarningMessage(hits);
  const mode = await getEffectiveAgeMode();
  const block =
    mode === "minor_separated_test" || mode === "open_16_plus";

  return { ok: false, block, message, hits };
}

/** Prefer chat moderation; fall back to general moderation for non-chat posts. */
export async function moderateUserTextAllowingLinks(
  text: string
): Promise<ContentModerationDecision> {
  return moderateChatText(text);
}

export { moderateUserText };
