import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { canUseWebShare, shareOrCopyInviteUrl } from "@/lib/inviteShare";

describe("inviteShare", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: {
          writeText: vi.fn(async () => undefined),
        },
      },
      configurable: true,
      writable: true,
    });
  });

  it("reports Web Share unavailable without share()", () => {
    expect(canUseWebShare("https://example.com/invite")).toBe(false);
  });

  it("copies when Web Share is unavailable", async () => {
    const result = await shareOrCopyInviteUrl({
      url: "https://example.com/room?invite=1",
    });
    expect(result).toEqual({ ok: true, method: "clipboard" });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com/room?invite=1"
    );
  });

  it("uses Web Share when available", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: {
        share,
        canShare: () => true,
        clipboard: { writeText: vi.fn() },
      },
      configurable: true,
      writable: true,
    });

    const result = await shareOrCopyInviteUrl({
      url: "https://example.com/room?invite=1",
      title: "Classmate",
      text: "参加してね",
    });
    expect(result).toEqual({ ok: true, method: "share" });
    expect(share).toHaveBeenCalled();
  });
});
