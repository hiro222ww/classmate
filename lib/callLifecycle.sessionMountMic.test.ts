import { describe, expect, it } from "vitest";
import { resolveSessionMountMicAction } from "@/lib/callLifecycle";

describe("resolveSessionMountMicAction", () => {
  it("reuses a live session mic when release-on-mute and muted", () => {
    expect(
      resolveSessionMountMicAction({
        releaseOnMute: true,
        userMuted: true,
        hasLiveSessionMic: true,
      })
    ).toBe("reuse_live");
  });

  it("releases when muted with no live mic (listen-only / empty)", () => {
    expect(
      resolveSessionMountMicAction({
        releaseOnMute: true,
        userMuted: true,
        hasLiveSessionMic: false,
      })
    ).toBe("release_muted");
  });

  it("keeps or acquires when not releasing on mute", () => {
    expect(
      resolveSessionMountMicAction({
        releaseOnMute: false,
        userMuted: true,
        hasLiveSessionMic: true,
      })
    ).toBe("keep_or_acquire");
  });

  it("keeps or acquires when unmuted", () => {
    expect(
      resolveSessionMountMicAction({
        releaseOnMute: true,
        userMuted: false,
        hasLiveSessionMic: true,
      })
    ).toBe("keep_or_acquire");
  });
});
