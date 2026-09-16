/**
 * Detect short emoji-only chat messages for jumbo (bubble-less) display.
 * Matches common chat apps: 1–3 emoji grapheme clusters, no other text.
 */

const EMOJI_TOKEN =
  /(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|\p{Regional_Indicator}{2})/gu;

export function countEmojiTokens(text: string): number {
  const matches = String(text ?? "").match(EMOJI_TOKEN);
  return matches?.length ?? 0;
}

/** True when the message is only 1–3 emojis (optional whitespace). */
export function isJumboEmojiMessage(text: string): boolean {
  const raw = String(text ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return false;

  const withoutEmoji = trimmed.replace(EMOJI_TOKEN, "").replace(/\s+/g, "");
  if (withoutEmoji.length > 0) return false;

  const count = countEmojiTokens(trimmed);
  return count >= 1 && count <= 3;
}
