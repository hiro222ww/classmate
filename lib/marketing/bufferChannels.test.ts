import { describe, expect, it } from "vitest";
import { findChannelsByHandle } from "@/lib/marketing/bufferChannels";
import type { BufferChannelSummary } from "@/lib/marketing/bufferChannels";

const channels: BufferChannelSummary[] = [
  {
    id: "ch_ig",
    name: "classmate.ig",
    service: "instagram",
    displayName: "Classmate",
    descriptor: "Instagram Business",
    externalLink: "https://instagram.com/classmate.ig",
    isDisconnected: false,
    isLocked: false,
    organizationId: "org1",
  },
  {
    id: "ch_x",
    name: "classmate0401",
    service: "twitter",
    displayName: "Classmate",
    descriptor: "Twitter Profile",
    externalLink: "https://x.com/classmate0401",
    isDisconnected: false,
    isLocked: false,
    organizationId: "org1",
  },
];

describe("findChannelsByHandle", () => {
  it("matches X handle classmate0401 and prefers twitter service", () => {
    const match = findChannelsByHandle(channels, "@classmate0401");
    expect(match.matched).toHaveLength(1);
    expect(match.suggestedChannelId).toBe("ch_x");
  });

  it("matches via external link", () => {
    const match = findChannelsByHandle(channels, "classmate0401");
    expect(match.suggestedChannelId).toBe("ch_x");
  });
});
