import { createHash } from "crypto";
import { normalizeForFingerprint } from "@/lib/feedback/sanitize";
import type { FeedbackCategory, FeedbackSeverity } from "@/lib/feedback/types";

export function clusterFingerprint(params: {
  category: FeedbackCategory;
  redactedBody: string;
}): string {
  const norm = normalizeForFingerprint(params.redactedBody);
  const tokens = norm.split(" ").filter(Boolean).slice(0, 12).join(" ");
  const raw = `${params.category}|${tokens}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function uniqueVoiceKey(params: {
  deviceId: string;
  fingerprint: string;
}): string {
  return createHash("sha256")
    .update(`${params.deviceId}|${params.fingerprint}`)
    .digest("hex")
    .slice(0, 40);
}

export function clusterTitleFromSummary(
  category: FeedbackCategory,
  summary: string,
  severity: FeedbackSeverity
): string {
  const head = summary.slice(0, 40) || "（要約なし）";
  return `[${severity}] ${category}: ${head}`;
}

/** Simple token overlap for matching an existing open cluster when fingerprints differ slightly. */
export function tokenOverlapRatio(a: string, b: string): number {
  const sa = new Set(normalizeForFingerprint(a).split(" ").filter(Boolean));
  const sb = new Set(normalizeForFingerprint(b).split(" ").filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / Math.min(sa.size, sb.size);
}
