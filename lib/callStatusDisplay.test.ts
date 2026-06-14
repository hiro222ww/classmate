import { describe, expect, it } from "vitest";
import {
  PRE_CONFIRM_UNSTABLE_MIN_MS,
  isUnstableStatusLabel,
  normalizeCallStatusDisplayText,
  shouldDeferPreConfirmUnstable,
  simplifyUserFacingStatusText,
} from "./memberPresenceStatus";

describe("call status display normalization", () => {
  const nowMs = 100_000;

  it("maps internal connecting labels to user-facing 接続中", () => {
    for (const internal of [
      "音声確認中",
      "接続処理中",
      "音声を調整中",
      "接続を調整中",
      "接続準備中",
    ]) {
      expect(normalizeCallStatusDisplayText(internal)).toBe("接続中");
      expect(simplifyUserFacingStatusText(internal)).toBe("接続中…");
    }
  });

  it("detects unstable labels including 接続が不安定です", () => {
    expect(isUnstableStatusLabel("音声が不安定です")).toBe(true);
    expect(isUnstableStatusLabel("接続が不安定です")).toBe(true);
    expect(isUnstableStatusLabel("接続が不安定です。入り直してください")).toBe(
      true
    );
    expect(isUnstableStatusLabel("接続中")).toBe(false);
    expect(isUnstableStatusLabel("通話中")).toBe(false);
  });

  it("defers unstable before audio_confirmed_strict and during repair", () => {
    expect(
      shouldDeferPreConfirmUnstable({
        audioConfirmedStrict: false,
        recentConfirmed: false,
        voicePeerRepairInProgress: true,
        transportRecovering: false,
        nowMs,
      })
    ).toBe(true);

    expect(
      shouldDeferPreConfirmUnstable({
        audioConfirmedStrict: false,
        recentConfirmed: false,
        voicePeerRepairInProgress: false,
        transportRecovering: true,
        nowMs,
      })
    ).toBe(true);

    expect(
      shouldDeferPreConfirmUnstable({
        audioConfirmedStrict: false,
        recentConfirmed: false,
        voicePeerRepairInProgress: false,
        transportRecovering: false,
        liveStreamHealHold: true,
        nowMs,
      })
    ).toBe(true);
  });

  it("defers unstable when unhealthy duration is below pre-confirm minimum", () => {
    const since = nowMs - (PRE_CONFIRM_UNSTABLE_MIN_MS - 1);
    expect(
      shouldDeferPreConfirmUnstable({
        audioConfirmedStrict: false,
        recentConfirmed: false,
        voicePeerRepairInProgress: false,
        transportRecovering: false,
        audioUnhealthySinceMs: since,
        nowMs,
      })
    ).toBe(true);

    expect(
      shouldDeferPreConfirmUnstable({
        audioConfirmedStrict: false,
        recentConfirmed: false,
        voicePeerRepairInProgress: false,
        transportRecovering: false,
        audioUnhealthySinceMs: nowMs - PRE_CONFIRM_UNSTABLE_MIN_MS,
        nowMs,
      })
    ).toBe(false);
  });

  it("does not defer unstable after strict confirmation", () => {
    expect(
      shouldDeferPreConfirmUnstable({
        audioConfirmedStrict: true,
        recentConfirmed: false,
        voicePeerRepairInProgress: true,
        transportRecovering: true,
        nowMs,
      })
    ).toBe(false);
  });
});
