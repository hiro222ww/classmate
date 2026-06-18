import { describe, expect, it } from "vitest";
import {
  PRE_CONFIRM_UNSTABLE_MIN_MS,
  applyCallMemberStatusHysteresis,
  isUnstableStatusLabel,
  normalizeCallStatusDisplayText,
  resolveCallMemberStatus,
  resolveCallMemberUserDisplayText,
  shouldDeferPreConfirmUnstable,
  simplifyUserFacingStatusText,
} from "./memberPresenceStatus";

const baseRemoteStatusParams = {
  isMe: false,
  isMuted: false,
  isInCall: true,
  peerState: "connected" as const,
  wasPeerConnected: true,
  hasRemoteStream: true,
  trackReady: "live",
  conn: "connected",
  ice: "connected",
  hasPc: true,
  nowMs: 100_000,
  participationPriority: "in_call" as const,
  peerStillInCall: true,
};

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

describe("established audio display priority", () => {
  const nowMs = 100_000;

  it("shows 通話中 when strict confirmed even if repair is in progress", () => {
    const status = resolveCallMemberStatus({
      ...baseRemoteStatusParams,
      voicePeerRepairInProgress: true,
      remoteAudioHealth: {
        audioConfirmedStrict: true,
        trackReady: "live",
        playSuccess: true,
        audioActuallyPlaying: true,
      },
    });

    expect(status.text).toBe("通話中");
    expect(status.reason).toBe("remote_audio_confirmed_strict");
  });

  it("hysteresis promotes 再接続中 to 通話中 when strict confirmed", () => {
    const candidate = {
      text: "再接続中",
      color: "#92400e",
      chipBg: "#fffbeb",
      chipText: "#b45309",
      reason: "voice_peer_repair_in_progress",
      source: "autoHardReset",
    };

    const out = applyCallMemberStatusHysteresis({
      remoteDeviceId: "peer-1e8",
      candidate,
      previous: {
        displayedText: "再接続中",
        displayedReason: "voice_peer_repair_in_progress",
        stableConnectedSinceMs: null,
        pendingDowngradeText: null,
        pendingDowngradeSinceMs: null,
      },
      nowMs,
      isMe: false,
      recentPlaySuccess: true,
      audioActuallyPlaying: true,
      playbackActive: true,
      audioConfirmedStrict: true,
      lastPlaybackConfirmedAt: nowMs - 1_000,
      connectedSoftAtMs: null,
      connectedStrictAtMs: nowMs - 1_000,
    });

    expect(out.status.text).toBe("通話中");
    expect(out.state.displayedText).toBe("通話中");
    expect(out.state.displayedReason).toBe("voice_peer_repair_in_progress");
  });

  it("user display text never shows 再接続中 when strict confirmed", () => {
    expect(
      resolveCallMemberUserDisplayText({
        text: "再接続中",
        audioConfirmedStrict: true,
      })
    ).toBe("通話中");
  });

  it("does not downgrade to 参加準備中 when audio is already strict confirmed", () => {
    const status = resolveCallMemberStatus({
      ...baseRemoteStatusParams,
      isInCall: false,
      screen: "room",
      participationPriority: "presence_stale_grace",
      peerStillInCall: true,
      remoteAudioHealth: {
        audioConfirmedStrict: true,
        trackReady: "live",
        playSuccess: true,
        audioActuallyPlaying: true,
      },
    });

    expect(status.text).toBe("通話中");
  });
});
