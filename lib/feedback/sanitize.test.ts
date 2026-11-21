import { describe, expect, it } from "vitest";
import { normalizeForFingerprint, redactFeedbackText } from "@/lib/feedback/sanitize";

describe("redactFeedbackText", () => {
  it("masks email phone url uuid mention", () => {
    const out = redactFeedbackText(
      "連絡は test@example.com か 090-1234-5678 で https://example.com/a と id 550e8400-e29b-41d4-a716-446655440000 @someone"
    );
    expect(out).toContain("[email]");
    expect(out).toContain("[phone]");
    expect(out).toContain("[url]");
    expect(out).toContain("[id]");
    expect(out).toContain("[user]");
    expect(out).not.toContain("test@example.com");
  });
});

describe("normalizeForFingerprint", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeForFingerprint("通話が、切れる！！")).toContain("通話");
  });
});
