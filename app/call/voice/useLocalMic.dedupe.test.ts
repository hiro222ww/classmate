import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Verifies concurrent ensureLocalMicStream callers share one getUserMedia.
 * Imports the mic module after installing a mock on navigator.mediaDevices.
 */

describe("useLocalMic getUserMedia dedupe", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shares one getUserMedia across concurrent ensure calls", async () => {
    let getUserMediaCalls = 0;
    const track = {
      id: "track-abc123",
      kind: "audio",
      label: "mock-mic",
      readyState: "live",
      enabled: true,
      muted: false,
      getSettings: () => ({ deviceId: "mic-1" }),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;

    const stream = {
      id: "stream-xyz789",
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;

    const getUserMedia = vi.fn(async () => {
      getUserMediaCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return stream;
    });

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: { getUserMedia, enumerateDevices: async () => [] },
        permissions: {
          query: async () => ({ state: "granted" }),
        },
        userAgent: "vitest",
      },
    });

    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: {
        getEntriesByType: () => [{ type: "navigate" }],
      },
    });

    const { requestCallMicrophone, releaseSessionMic } = await import(
      "@/app/call/voice/useLocalMic"
    );

    releaseSessionMic("test_reset");

    const sessionId = "11111111-2222-4333-8444-555555555555";
    const [a, b] = await Promise.all([
      requestCallMicrophone({
        sessionId,
        deviceId: "device-a",
        userMuted: false,
        reason: "auto_granted",
      }),
      requestCallMicrophone({
        sessionId,
        deviceId: "device-a",
        userMuted: false,
        reason: "auto_granted",
      }),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(getUserMediaCalls).toBe(1);

    releaseSessionMic("test_cleanup", sessionId);
  });
});
