import { describe, expect, it } from "vitest";
import {
  isSafeHttpUrl,
  splitMessageTextWithLinks,
} from "./messageLinkify";

describe("messageLinkify", () => {
  it("linkifies only http(s) urls", () => {
    const parts = splitMessageTextWithLinks(
      "見て https://example.com/path と http://foo.test ね"
    );
    expect(parts).toEqual([
      { type: "text", value: "見て " },
      {
        type: "link",
        value: "https://example.com/path",
        href: "https://example.com/path",
      },
      { type: "text", value: " と " },
      { type: "link", value: "http://foo.test", href: "http://foo.test" },
      { type: "text", value: " ね" },
    ]);
  });

  it("does not linkify javascript or other schemes", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,hi")).toBe(false);
    const parts = splitMessageTextWithLinks("危険 javascript:alert(1) です");
    expect(parts.every((p) => p.type === "text")).toBe(true);
  });

  it("strips trailing punctuation from urls", () => {
    const parts = splitMessageTextWithLinks("URLは https://example.com。");
    expect(parts).toContainEqual({
      type: "link",
      value: "https://example.com",
      href: "https://example.com",
    });
  });
});
