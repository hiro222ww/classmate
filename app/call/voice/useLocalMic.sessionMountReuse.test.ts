import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSessionMountMicAction } from "@/lib/callLifecycle";

/**
 * Regression: gate mic success must not be killed by VoiceLayer session_mount
 * when releaseMicOnMute + safety mute would previously call releaseLocalMicCapture.
 */

describe("useLocalMic session_mount live mic handoff", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("keeps the same live track after gate acquire when muted+release policy would release", async () => {
    const stop = vi.fn();
    const track = {
      id: "track-gate-live-01",
      kind: "audio",
      label: "mock-mic",
      readyState: "live",
      enabled: true,
      muted: false,
      getSettings: () => ({ deviceId: "mic-1" }),
      stop,
    } as unknown as MediaStreamTrack;

    const stream = {
      id: "stream-gate-01",
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: vi.fn(async () => stream),
          enumerateDevices: async () => [],
        },
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

    const {
      requestCallMicrophone,
      releaseSessionMic,
      isCallMicSessionActive,
      releaseLocalMicCapture,
    } = await import("@/app/call/voice/useLocalMic");

    releaseSessionMic("test_reset");

    const sessionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const deviceId = "device-fd3b";

    const result = await requestCallMicrophone({
      sessionId,
      deviceId,
      userMuted: true,
      reason: "auto_granted",
    });

    expect(result.ok).toBe(true);
    expect(isCallMicSessionActive(sessionId)).toBe(true);

    // Decision the VoiceLayer session_mount path must take.
    expect(
      resolveSessionMountMicAction({
        releaseOnMute: true,
        userMuted: true,
        hasLiveSessionMic: isCallMicSessionActive(sessionId),
      })
    ).toBe("reuse_live");

    // Old race: session_mount_muted release would stop the gate track.
    const streamRef = { current: stream };
    const trackRef = { current: track };
    releaseLocalMicCapture({
      sessionId,
      streamRef,
      trackRef,
      reason: "session_mount_muted",
    });
    expect(stop).toHaveBeenCalled();
    expect(isCallMicSessionActive(sessionId)).toBe(false);

    // With reuse_live we must not take that release path when cache is live.
    // Re-acquire to assert unmount/leave still releases intentionally.
    stop.mockClear();
    Object.defineProperty(track, "readyState", {
      configurable: true,
      value: "live",
    });
    const stream2 = {
      id: "stream-gate-02",
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    (
      navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(stream2);

    const again = await requestCallMicrophone({
      sessionId,
      deviceId,
      userMuted: true,
      reason: "auto_granted",
    });
    expect(again.ok).toBe(true);
    expect(isCallMicSessionActive(sessionId)).toBe(true);

    releaseSessionMic("voice_layer_unmount", sessionId);
    expect(stop).toHaveBeenCalled();
    expect(isCallMicSessionActive(sessionId)).toBe(false);
  });
});
