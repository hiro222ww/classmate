/**
 * Redact PII-like tokens before any AI or aggregate use.
 * Does not claim perfect anonymity — prefer aggregates for weekly reports.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s-]?)?(?:\d{2,4}[\s-]?){2,4}\d{2,4}/g;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const URL_RE = /https?:\/\/\S+/gi;
const MENTION_RE = /@[A-Za-z0-9_]{2,32}/g;

export function redactFeedbackText(input: string): string {
  let s = String(input ?? "");
  s = s.replace(EMAIL_RE, "[email]");
  s = s.replace(URL_RE, "[url]");
  s = s.replace(UUID_RE, "[id]");
  s = s.replace(MENTION_RE, "[user]");
  // Phone after email/url to reduce false positives on version numbers — still imperfect
  s = s.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 10 ? "[phone]" : m;
  });
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 4000);
}

export function normalizeForFingerprint(redacted: string): string {
  return redactFeedbackText(redacted)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}
