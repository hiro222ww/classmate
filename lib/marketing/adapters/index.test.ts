import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMarketingPublishStatus,
  getPublishAdapter,
  isExternalPublishConnected,
} from "@/lib/marketing/adapters";

const keys = [
  "BUFFER_ACCESS_TOKEN",
  "BUFFER_API_KEY",
  "BUFFER_CHANNEL_ID",
  "MARKETING_BUFFER_PUBLISH_ENABLED",
] as const;

beforeEach(() => {
  for (const k of keys) delete process.env[k];
});

afterEach(() => {
  for (const k of keys) delete process.env[k];
});

describe("publish adapters", () => {
  it("falls back to manual when Buffer is absent", async () => {
    const adapter = getPublishAdapter("x");
    expect(adapter.channel).toBe("manual");
    const result = await adapter.publish({
      postId: "test",
      bodyText: "hello",
      trackingUrl: null,
      scheduledAt: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("manual_only");
    expect(isExternalPublishConnected()).toBe(false);
  });

  it("uses Buffer adapter but refuses network when gate is off", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "tok";
    process.env.BUFFER_CHANNEL_ID = "ch_1";
    const adapter = getPublishAdapter("x");
    expect(adapter.channel).toBe("buffer");
    const result = await adapter.publish({
      postId: "test",
      bodyText: "hello",
      trackingUrl: "https://classmate-room.com/?utm_source=x",
      scheduledAt: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("buffer_publish_disabled");
    expect(getMarketingPublishStatus().activeAdapter).toBe("manual");
  });
});
