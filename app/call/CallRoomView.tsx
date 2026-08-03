"use client";

import type { ReactNode } from "react";
import CallPresenceToastStack from "@/components/call/CallPresenceToastStack";
import MemberListAvatar from "@/components/MemberListAvatar";
import MemberModerationButtons from "@/components/MemberModerationButtons";
import { isAppShellContext } from "@/lib/appShellContext";
import type { CallPresenceToast } from "@/lib/callPresenceToasts";
import { formatMemberDisplayName } from "@/lib/resolveDisplayName";
import {
  LIST_MEMBER_AVATAR_PX,
  normalizeMemberDeviceId,
} from "@/lib/memberProfileView";
import {
  computeAudioUnhealthySinceMs,
  isRecentPlaySuccess,
  resolveCallMemberUserDisplayText,
  resolveDisplayManualAudioReconnect,
} from "@/lib/memberPresenceStatus";
import {
  isVoiceLayerDebugEnabled,
  type PeerStatusDiagnostics,
} from "@/app/call/voice/voiceDiagnostics";
import type { RemotePlaybackHealth } from "@/app/call/voice/RemoteAudio";

/** Member shape shared by CallClient and the call demo view. */
export type CallRoomViewMember = {
  device_id: string;
  display_name: string;
  photo_path: string | null;
  avatar_url?: string | null;
  lastSpokeAt?: number;
  is_in_call?: boolean;
  screen?: string | null;
  joined_at?: string | null;
  last_seen_at?: string | null;
};

export type CallRoomViewMemberStatus = {
  text: string;
  color: string;
  chipBg: string;
  chipText: string;
};

export type CallRoomViewProps = {
  voiceLayer?: ReactNode;
  entryGateSlot?: ReactNode;
  boardSlot?: ReactNode;
  messagesSlot?: ReactNode;
  profileModalSlot?: ReactNode;
  /** Extra banners (e.g. demo scene messages) rendered after production banners. */
  bannerSlot?: ReactNode;

  presenceToasts: CallPresenceToast[];

  filled: number;
  capacity: number;
  membersSyncRevision: number;
  showCallStuckReconnect?: boolean;
  onCallStuckReconnect?: () => void;
  meetingPlanLabel?: string | null;
  callRequestLabel?: string | null;

  onProfileEdit: () => void;
  onInviteFriends: () => void;
  onHome?: () => void;
  onExit: () => void;

  fetchErrorCount?: number;
  showWaitingForOthers?: boolean;

  visibleMembers: CallRoomViewMember[];
  deviceId: string;
  classId?: string;
  sessionId?: string;
  nowMs: number;
  getMemberStatus: (member?: CallRoomViewMember) => CallRoomViewMemberStatus;
  peerDiagnostics?: Record<string, PeerStatusDiagnostics>;
  remoteAudioHealth?: Record<string, RemotePlaybackHealth | null | undefined>;
  isSessionMember?: (memberId: string) => boolean;
  wasPeerConnected?: (memberId: string) => boolean;
  onMemberClick?: (member: CallRoomViewMember) => void;
  onManualAudioReconnect?: (memberId: string) => void;
  showMemberModeration?: boolean;
  /**
   * When true (default), chip labels go through production
   * resolveCallMemberUserDisplayText. Demo sets false to keep staged copy.
   */
  resolveStatusDisplayText?: boolean;

  showMicPermissionWarning?: boolean;
  micPermissionWarningTitle?: string;
  micPermissionWarningBody?: string;
  onRetryMic?: () => void;
  voiceJoinFatalError?: boolean;
  voiceSelfReconnecting?: boolean;
  onVoiceReconnect?: () => void;
  muteDisabled?: boolean;
  userMuted: boolean;
  micReady: boolean;
  muteButtonLabel: string;
  onMuteClick: () => void;
  micLevel: number;
};

/**
 * Presentational call-room chrome shared by live CallClient and /call/demo.
 * Voice / Realtime / DB logic stay outside; pass slots for those surfaces.
 */
export default function CallRoomView({
  voiceLayer,
  entryGateSlot,
  boardSlot,
  messagesSlot,
  profileModalSlot,
  bannerSlot,
  presenceToasts,
  filled,
  capacity,
  membersSyncRevision,
  showCallStuckReconnect = false,
  onCallStuckReconnect,
  meetingPlanLabel,
  callRequestLabel,
  onProfileEdit,
  onInviteFriends,
  onHome,
  onExit,
  fetchErrorCount = 0,
  showWaitingForOthers = false,
  visibleMembers,
  deviceId,
  classId = "",
  sessionId = "",
  nowMs,
  getMemberStatus,
  peerDiagnostics = {},
  remoteAudioHealth = {},
  isSessionMember,
  wasPeerConnected,
  onMemberClick,
  onManualAudioReconnect,
  showMemberModeration = true,
  resolveStatusDisplayText = true,
  showMicPermissionWarning = false,
  micPermissionWarningTitle,
  micPermissionWarningBody,
  onRetryMic,
  voiceJoinFatalError = false,
  voiceSelfReconnecting = false,
  onVoiceReconnect,
  muteDisabled = false,
  userMuted,
  micReady,
  muteButtonLabel,
  onMuteClick,
  micLevel,
}: CallRoomViewProps) {
  const inAppShell = isAppShellContext();

  return (
    <main
      className={
        inAppShell ? "app-immersive-inner app-immersive-inner--wide" : undefined
      }
      style={
        inAppShell ? undefined : { maxWidth: 1100, margin: "0 auto", padding: 16 }
      }
    >
      <CallPresenceToastStack toasts={presenceToasts} />

      {voiceLayer}

      {entryGateSlot}

      <div
        className={inAppShell ? "app-immersive-call-header" : undefined}
        style={
          inAppShell
            ? undefined
            : {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }
        }
      >
        <div>
          <h1
            className={inAppShell ? "app-shell-title" : undefined}
            style={
              inAppShell
                ? undefined
                : { fontSize: 24, fontWeight: 900, margin: 0 }
            }
          >
            通話ルーム
          </h1>
          <div
            className={inAppShell ? "app-shell-subtitle" : undefined}
            style={
              inAppShell
                ? undefined
                : { marginTop: 6, fontSize: 13, color: "#666" }
            }
          >
            参加人数{" "}
            {membersSyncRevision > 0
              ? `${filled}/${capacity}`
              : `--/${capacity}`}
          </div>
          {isVoiceLayerDebugEnabled() && showCallStuckReconnect ? (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#92400e", fontWeight: 800 }}>
                接続処理が長時間続いています
              </span>
              <button
                type="button"
                onClick={() => onCallStuckReconnect?.()}
                style={{
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "1px solid #f59e0b",
                  background: "#fffbeb",
                  color: "#b45309",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                再接続
              </button>
            </div>
          ) : null}
          {meetingPlanLabel ? (
            <div style={{ marginTop: 4, fontSize: 12, color: "#374151", fontWeight: 800 }}>
              {meetingPlanLabel}
            </div>
          ) : null}
          {callRequestLabel ? (
            <div style={{ marginTop: 4, fontSize: 12, color: "#92400e", fontWeight: 800 }}>
              {callRequestLabel}
            </div>
          ) : null}
        </div>

        <div
          className={inAppShell ? "app-immersive-call-actions" : undefined}
          style={
            inAppShell
              ? undefined
              : { display: "flex", gap: 8, flexWrap: "wrap" }
          }
        >
          <button
            type="button"
            onClick={onProfileEdit}
            className={
              inAppShell ? "app-shell-btn app-shell-btn--ghost" : undefined
            }
            style={
              inAppShell
                ? undefined
                : {
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    color: "#374151",
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: "pointer",
                  }
            }
          >
            プロフィール編集
          </button>

          <button
            className={
              inAppShell ? "app-shell-btn app-shell-btn--primary" : undefined
            }
            onClick={onInviteFriends}
            style={
              inAppShell
                ? undefined
                : {
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                  }
            }
          >
            友達を招待
          </button>

          {inAppShell && onHome ? (
            <button
              type="button"
              className="app-shell-btn app-shell-btn--ghost"
              onClick={onHome}
            >
              ホーム
            </button>
          ) : null}

          <button
            type="button"
            className={
              inAppShell ? "app-shell-btn app-shell-btn--danger" : undefined
            }
            style={
              inAppShell
                ? undefined
                : {
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    color: "#374151",
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: "pointer",
                  }
            }
            onClick={onExit}
          >
            退出
          </button>
        </div>
      </div>

      {fetchErrorCount >= 3 && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "#fffbeb",
            color: "#92400e",
            border: "1px solid #fde68a",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          通話メンバーの取得を再試行中です。接続中の通話は維持します。
        </div>
      )}

      {showWaitingForOthers ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "#f9fafb",
            color: "#6b7280",
            border: "1px solid #e5e7eb",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          他の参加者の参加を待っています。
        </div>
      ) : null}

      {bannerSlot}

      <section
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 12 }}>
          通話中のメンバー
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 12,
          }}
        >
          {Array.from({ length: capacity }).map((_, i) => {
            const member = visibleMembers[i];
            const isFilled = !!member;
            const isMe = member?.device_id === deviceId;
            const status = getMemberStatus(member);
            const memberId = member?.device_id ?? "";
            const diag = memberId ? peerDiagnostics[memberId] : undefined;
            const memberAudioHealth = memberId
              ? remoteAudioHealth[memberId] ?? null
              : null;
            const showManualAudioReconnect =
              isVoiceLayerDebugEnabled() &&
              !!member &&
              !isMe &&
              !!onManualAudioReconnect &&
              resolveDisplayManualAudioReconnect({
                isMe: false,
                conn: diag?.conn ?? "-",
                ice: diag?.ice ?? "-",
                hasPc: diag?.hasPc ?? false,
                hasRemoteStream: diag?.hasRemoteStream ?? false,
                lastPlaybackConfirmedAt: diag?.lastPlaybackConfirmedAt ?? null,
                lastPlaybackActiveAt: diag?.lastPlaybackActiveAt ?? null,
                lastOnTrackAt: diag?.lastOnTrackAt ?? null,
                lastUnmuteAt: diag?.lastUnmuteAt ?? null,
                lastPlaySuccessAt:
                  memberAudioHealth?.lastPlaySuccessAt ??
                  diag?.lastPlaySuccessAt ??
                  null,
                remoteAudioHealth: memberAudioHealth,
                trackReady:
                  memberAudioHealth?.trackReady ?? diag?.trackReady ?? "-",
                liveStreamHealHold: diag?.liveStreamHealHold === true,
                p2pDirectFailedHoldActive: diag?.p2pDirectFailedHoldActive === true,
                autoHardResetInProgress: diag?.autoHardResetInProgress === true,
                voicePeerRepairInProgress: diag?.voicePeerRepairInProgress === true,
                autoHardResetGiveUp: diag?.autoHardResetGiveUp === true,
                reconnectRequestPending: diag?.reconnectRequestPending === true,
                wasPeerConnected: wasPeerConnected?.(memberId) === true,
                nowMs,
                debugUi: isVoiceLayerDebugEnabled(),
                audioUnhealthySinceMs: computeAudioUnhealthySinceMs({
                  nowMs,
                  remoteAudioHealth: memberAudioHealth,
                  hasRemoteStream: diag?.hasRemoteStream ?? false,
                  trackReady:
                    memberAudioHealth?.trackReady ?? diag?.trackReady ?? "-",
                  wasPeerConnected: wasPeerConnected?.(memberId) === true,
                }),
                remoteDeviceId: memberId,
              }).show;
            const avatarEager = i < 4;

            const isSpeaking =
              !!member?.lastSpokeAt &&
              nowMs > 0 &&
              nowMs - member.lastSpokeAt < 1500;

            return (
              <div
                key={member?.device_id ?? `empty-${i}`}
                style={{
                  minHeight: 96,
                  borderRadius: 16,
                  border: isSpeaking
                    ? "2px solid #22c55e"
                    : "1px solid #e5e7eb",
                  background: isFilled ? "#ffffff" : "#f9fafb",
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  boxShadow: isSpeaking
                    ? "0 8px 24px rgba(34,197,94,0.18)"
                    : "none",
                  transform: isSpeaking ? "translateY(-2px)" : "none",
                  transition:
                    "transform 160ms ease, box-shadow 160ms ease, border 160ms ease",
                }}
              >
                <button
                  type="button"
                  disabled={!isFilled || !member || !deviceId}
                  onClick={() => {
                    if (!member) return;
                    const memberDeviceId = normalizeMemberDeviceId(
                      member.device_id
                    );
                    if (!memberDeviceId || !deviceId) return;
                    onMemberClick?.(member);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    margin: 0,
                    cursor: isFilled && member ? "pointer" : "default",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: LIST_MEMBER_AVATAR_PX,
                      height: LIST_MEMBER_AVATAR_PX,
                      borderRadius: "50%",
                      background: isFilled ? "#dbeafe" : "#e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 900,
                      overflow: "hidden",
                      flexShrink: 0,
                      border: isMe ? "2px solid #22c55e" : "1px solid #d1d5db",
                    }}
                  >
                    {member ? (
                      <MemberListAvatar
                        photoPath={member.photo_path}
                        avatarUrl={member.avatar_url}
                        label={member.display_name}
                        sizePx={LIST_MEMBER_AVATAR_PX}
                        isMe={isMe}
                        eager={avatarEager}
                      />
                    ) : null}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: isFilled ? "#111827" : "#9ca3af",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {isFilled
                        ? isMe
                          ? `${formatMemberDisplayName(member)} (You)`
                          : formatMemberDisplayName(member)
                        : "空席"}
                    </div>
                  </div>
                </button>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: isSpeaking ? "#dcfce7" : status.chipBg,
                        color: isSpeaking ? "#166534" : status.chipText,
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {isSpeaking
                        ? "発話中"
                        : resolveStatusDisplayText
                          ? resolveCallMemberUserDisplayText({
                              text: status.text,
                              isMe,
                              screen: member?.screen ?? null,
                              isInCall: member?.is_in_call === true,
                              inSessionMember: memberId
                                ? isSessionMember?.(memberId) === true
                                : false,
                              audioConfirmedStrict:
                                memberAudioHealth?.audioConfirmedStrict === true,
                              playbackActive:
                                memberAudioHealth?.playbackActive === true,
                              audioActuallyPlaying:
                                memberAudioHealth?.audioActuallyPlaying === true,
                              recentPlaySuccess: isRecentPlaySuccess(
                                memberAudioHealth?.lastPlaySuccessAt ??
                                  diag?.lastPlaySuccessAt,
                                nowMs
                              ),
                            })
                          : status.text}
                    </div>

                    {showManualAudioReconnect && memberId ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onManualAudioReconnect?.(memberId);
                        }}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 8,
                          border: "1px solid #f59e0b",
                          background: "#fffbeb",
                          color: "#b45309",
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        音声を再接続
                      </button>
                    ) : null}
                  </div>

                  {showMemberModeration &&
                  isFilled &&
                  !isMe &&
                  member?.device_id &&
                  classId &&
                  sessionId ? (
                    <details style={{ marginTop: 4, position: "relative" }}>
                      <summary
                        style={{
                          listStyle: "none",
                          cursor: "pointer",
                          fontSize: 18,
                          color: "#9ca3af",
                          lineHeight: 1,
                          width: 28,
                          height: 28,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 999,
                        }}
                      >
                        ︙
                      </summary>

                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: 32,
                          zIndex: 20,
                          padding: 8,
                          borderRadius: 12,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                        }}
                      >
                        <MemberModerationButtons
                          myDeviceId={deviceId}
                          targetDeviceId={member.device_id}
                          targetName={formatMemberDisplayName(member)}
                          sessionId={sessionId}
                          classId={classId}
                        />
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* <YouTubeWatchParty sessionId={sessionId} deviceId={deviceId} /> */}

      <section
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 15 }}>音声設定</div>

        {showMicPermissionWarning ? (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              fontSize: 13,
              color: "#92400e",
            }}
          >
            <div style={{ fontWeight: 800 }}>
              {micPermissionWarningTitle || "マイク準備中…"}
            </div>
            {micPermissionWarningBody ? (
              <div style={{ marginTop: 6, lineHeight: 1.65 }}>
                {micPermissionWarningBody}
              </div>
            ) : null}
            {onRetryMic ? (
              <button
                type="button"
                onClick={onRetryMic}
                style={{
                  marginTop: 8,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #d97706",
                  background: "#fff",
                  color: "#92400e",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                もう一度試す
              </button>
            ) : null}
          </div>
        ) : null}

        {voiceJoinFatalError ? (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              fontSize: 13,
              color: "#4b5563",
              lineHeight: 1.65,
            }}
          >
            <div>音声接続に失敗しました。もう一度参加してください。</div>
            {onVoiceReconnect ? (
              <button
                type="button"
                onClick={onVoiceReconnect}
                style={{
                  marginTop: 8,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #9ca3af",
                  background: "#fff",
                  color: "#374151",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                音声を再接続
              </button>
            ) : null}
          </div>
        ) : voiceSelfReconnecting ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
            再接続中…
          </div>
        ) : null}

        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            disabled={muteDisabled || !micReady}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: userMuted ? "#fff" : "#111827",
              color: userMuted ? "#111827" : "#fff",
              fontWeight: 900,
              cursor: micReady ? "pointer" : "not-allowed",
              opacity: micReady ? 1 : 0.6,
            }}
            onClick={onMuteClick}
          >
            {muteButtonLabel}
          </button>

          <div style={{ fontSize: 12, color: "#374151", minWidth: 180 }}>
            マイク入力: {(micLevel * 100).toFixed(1)}
          </div>

          <div
            style={{
              width: 140,
              height: 10,
              borderRadius: 999,
              background: "#e5e7eb",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, micLevel * 800)}%`,
                height: "100%",
                background: "#111827",
              }}
            />
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>{boardSlot}</section>

      {messagesSlot ? <div style={{ marginTop: 16 }}>{messagesSlot}</div> : null}

      {profileModalSlot}
    </main>
  );
}
