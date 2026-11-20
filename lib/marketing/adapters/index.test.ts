import { describe, expect, it } from "vitest";
import { getPublishAdapter, isExternalPublishConnected } from "@/lib/marketing/adapters";

describe("publish adapters (Phase 1)", () => {
  it("falls back to manual adapter", async () => {
    const adapter = getPublishAdapter("x");
    expect(adapter.channel).toBe("manual");
    expect(adapter.isConfigured()).toBe(true);
    const result = await adapter.publish({
      postId: "test",
      bodyText: "hello",
      trackingUrl: null,
      scheduledAt: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("manual_only");
  });

  it("reports external publish as disconnected by default", () => {
    expect(isExternalPublishConnected()).toBe(false);
  });
});
