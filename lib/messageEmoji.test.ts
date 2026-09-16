import { describe, expect, it } from "vitest";
import { countEmojiTokens, isJumboEmojiMessage } from "./messageEmoji";

describe("isJumboEmojiMessage", () => {
  it("treats a single emoji as jumbo", () => {
    expect(isJumboEmojiMessage("😅")).toBe(true);
    expect(isJumboEmojiMessage("  😊  ")).toBe(true);
  });

  it("allows up to three emoji-only messages", () => {
    expect(isJumboEmojiMessage("👍👍")).toBe(true);
    expect(isJumboEmojiMessage("😀😅🎉")).toBe(true);
    expect(isJumboEmojiMessage("😀😅🎉😎")).toBe(false);
  });

  it("rejects text mixed with emoji", () => {
    expect(isJumboEmojiMessage("こんにちは")).toBe(false);
    expect(isJumboEmojiMessage("😅 ok")).toBe(false);
    expect(isJumboEmojiMessage("")).toBe(false);
  });

  it("counts ZWJ sequences as one token", () => {
    expect(countEmojiTokens("👨‍👩‍👧‍👦")).toBe(1);
    expect(isJumboEmojiMessage("👨‍👩‍👧‍👦")).toBe(true);
  });
});
