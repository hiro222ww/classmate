export const MESSAGE_MAX_LENGTH = 500;
export const MESSAGE_HISTORY_LIMIT = 50;
export const MESSAGE_MIN_INTERVAL_MS = 1500;

export type MessageValidationResult =
  | { ok: true; text: string }
  | { ok: false; error: string; message: string };

export function normalizeMessageText(input: unknown): string {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function validateMessageText(input: unknown): MessageValidationResult {
  const text = normalizeMessageText(input);
  if (!text) {
    return {
      ok: false,
      error: "empty_message",
      message: "メッセージを入力してください",
    };
  }
  if (text.length > MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: "too_long",
      message: `メッセージは${MESSAGE_MAX_LENGTH}文字以内で入力してください`,
    };
  }
  return { ok: true, text };
}

const lastSendByKey = new Map<string, number>();

export function checkMessageRateLimit(key: string, now = Date.now()): boolean {
  const normalized = String(key ?? "").trim();
  if (!normalized) return false;

  const previous = lastSendByKey.get(normalized);
  if (
    previous != null &&
    now - previous < MESSAGE_MIN_INTERVAL_MS
  ) {
    return false;
  }
  lastSendByKey.set(normalized, now);

  if (lastSendByKey.size > 5000) {
    const cutoff = now - MESSAGE_MIN_INTERVAL_MS * 10;
    for (const [entryKey, ts] of lastSendByKey) {
      if (ts < cutoff) lastSendByKey.delete(entryKey);
    }
  }

  return true;
}

export function resetMessageRateLimitsForTests() {
  lastSendByKey.clear();
}
