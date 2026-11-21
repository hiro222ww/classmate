import { createHash } from "crypto";

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /sk-[A-Za-z0-9]{20,}/g, label: "[secret]" },
  { re: /Bearer\s+[A-Za-z0-9._\-]{20,}/gi, label: "[secret]" },
  { re: /postgres(?:ql)?:\/\/\S+/gi, label: "[db_url]" },
  { re: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END/g, label: "[private_key]" },
  { re: /api[_-]?key\s*[:=]\s*\S+/gi, label: "[secret]" },
  { re: /password\s*[:=]\s*\S+/gi, label: "[secret]" },
];

const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above) instructions/i,
  /system prompt/i,
  /you are now/i,
  /<\/?system>/i,
  /\[INST\]/i,
];

/**
 * Treat memo/policy free text as untrusted.
 * Scrub secrets and neutralize common prompt-injection phrases.
 */
export function sanitizeCharterText(input: string): {
  text: string;
  blockedSecret: boolean;
  injectionFlags: string[];
} {
  let text = String(input ?? "");
  let blockedSecret = false;
  for (const { re, label } of SECRET_PATTERNS) {
    if (re.test(text)) {
      blockedSecret = true;
      text = text.replace(re, label);
    }
  }
  const injectionFlags: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      injectionFlags.push(re.source);
      text = text.replace(re, "[filtered_instruction]");
    }
  }
  // Strip control chars; keep JP/EN content
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  text = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  // Wrap as data, not instructions
  return { text, blockedSecret, injectionFlags };
}

export function fingerprintCharter(params: {
  category: string;
  title: string;
  body: string;
}): string {
  const raw = `${params.category}|${params.title.trim().toLowerCase()}|${params.body
    .trim()
    .toLowerCase()
    .slice(0, 400)}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Lightweight JP/EN tokens: space words + JP runs + character bigrams for JP.
 * Enough for memo duplicate/conflict heuristics without a morphological analyzer.
 */
export function tokenSet(text: string): Set<string> {
  const lower = String(text ?? "").toLowerCase();
  const out = new Set<string>();
  for (const t of lower
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 2)) {
    out.add(t);
  }
  const jpRuns = lower.match(/[\u3040-\u30ff\u4e00-\u9fff]{2,}/g) ?? [];
  for (const run of jpRuns) {
    out.add(run);
    if (run.length >= 4) {
      for (let i = 0; i < run.length - 1; i++) {
        out.add(run.slice(i, i + 2));
      }
    }
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}
