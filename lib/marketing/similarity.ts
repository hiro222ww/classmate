/** Lightweight Japanese/emoji-safe similarity for near-duplicate draft detection. */

function normalizeBody(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#＠@]\S+/g, " ")
    .replace(/[、。！？!?,.・\s　]+/g, "")
    .trim();
}

function charBigrams(text: string): Set<string> {
  const s = normalizeBody(text);
  const out = new Set<string>();
  if (s.length <= 1) {
    if (s) out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i += 1) {
    out.add(s.slice(i, i + 2));
  }
  return out;
}

/** Jaccard similarity over character bigrams (0–1). */
export function bodySimilarity(a: string, b: string): number {
  const A = charBigrams(a);
  const B = charBigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter += 1;
  }
  const union = A.size + B.size - inter;
  return union <= 0 ? 0 : inter / union;
}

export function maxSimilarityAgainst(
  candidate: string,
  existingBodies: string[]
): number {
  let max = 0;
  for (const body of existingBodies) {
    const score = bodySimilarity(candidate, body);
    if (score > max) max = score;
  }
  return max;
}

export const DEFAULT_SIMILARITY_THRESHOLD = 0.72;
