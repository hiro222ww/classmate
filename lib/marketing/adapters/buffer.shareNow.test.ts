import { afterEach, describe, expect, it, vi } from "vitest";

const mockGraphql = vi.fn();

vi.mock("@/lib/marketing/bufferClient", () => ({
  bufferGraphql: (...args: unknown[]) => mockGraphql(...args),
}));

vi.mock("@/lib/marketing/bufferConfig", () => ({
  getBufferChannelId: () => "channel-1",
  isBufferCredentialsPresent: () => true,
  isBufferPublishEnabled: () => false, // queue path would be blocked; now path must still work
}));

afterEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

describe("buffer shareNow", () => {
  it("uses mode shareNow and maps externalLink + sent status", async () => {
    mockGraphql.mockResolvedValue({
      ok: true,
      data: {
        createPost: {
          post: {
            id: "buf_1",
            status: "sent",
            externalLink: "https://x.com/classmate0401/status/1",
            sharedNow: true,
            sentAt: "2026-11-21T10:00:00.000Z",
          },
        },
      },
    });

    const { bufferPublishAdapter } = await import(
      "@/lib/marketing/adapters/buffer"
    );
    const result = await bufferPublishAdapter.publish({
      postId: "p1",
      bodyText: "hello",
      trackingUrl: null,
      scheduledAt: null,
      intent: "now",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scheduledOnly).toBe(false);
      expect(result.externalPermalink).toBe(
        "https://x.com/classmate0401/status/1"
      );
      expect(result.externalPostId).toBe("buf_1");
    }
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    const arg = mockGraphql.mock.calls[0][0] as { query: string };
    expect(arg.query).toMatch(/mode: shareNow/);
  });
});
