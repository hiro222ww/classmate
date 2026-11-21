import { afterEach, describe, expect, it, vi } from "vitest";
import { bufferPublishAdapter } from "@/lib/marketing/adapters/buffer";

const keys = [
  "BUFFER_ACCESS_TOKEN",
  "BUFFER_CHANNEL_ID",
  "MARKETING_BUFFER_PUBLISH_ENABLED",
] as const;

afterEach(() => {
  for (const k of keys) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("bufferPublishAdapter", () => {
  it("schedules via GraphQL when enabled", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "tok";
    process.env.BUFFER_CHANNEL_ID = "ch_1";
    process.env.MARKETING_BUFFER_PUBLISH_ENABLED = "1";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            createPost: {
              post: {
                id: "buf_123",
                text: "hello",
                dueAt: "2026-11-20T01:00:00.000Z",
                status: "scheduled",
              },
            },
          },
        }),
      }))
    );

    const result = await bufferPublishAdapter.publish({
      postId: "p1",
      bodyText: "hello classmate",
      trackingUrl: "https://classmate-room.com/?utm_source=x&utm_content=post_1",
      scheduledAt: "2026-11-20T01:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.externalPostId).toBe("buf_123");
      expect(result.scheduledOnly).toBe(true);
      expect(result.dueAt).toBe("2026-11-20T01:00:00.000Z");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(body.query).toContain("$channelId: ChannelId!");
  });
});
