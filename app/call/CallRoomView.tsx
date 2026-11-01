"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import CallPresenceToastStack from "@/components/call/CallPresenceToastStack";
import MemberModerationButtons from "@/components/MemberModerationButtons";
import {
  RoomAvatarStrip,
  type RoomAvatarStripMember,
} from "@/components/room/RoomAvatarStrip";
import { RoomSessionHero } from "@/components/room/RoomSessionHero";
import { isAppShellContext } from "@/lib/appShellContext";
import type { CallPresenceToast } from "@/lib/callPresenceToasts";
import {
  getCallSpeakerOn,
  setCallSpeakerOn,
  subscribeCallSpeaker,
} from "@/lib/callSpeaker";
import { formatMemberDisplayName } from "@/lib/resolveDisplayName";
import { normalizeMemberDeviceId } from "@/lib/memberProfileView";
import {
  computeAudioUnhealthySinceMs,
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
  /** In-call class formation vote (provisional → official). */
  classVoteSlot?: ReactNode;

  presenceToasts: CallPresenceToast[];

  filled: number;
  capacity: number;
  membersSyncRevision: number;
  /** When true, recruitment is closed — show 参加人数 instead of メンバー募集中. */
  membersLocked?: boolean;
  showCallStuckReconnect?: boolean;
  onCallStuckReconnect?: () => void;
  meetingPlanLabel?: string | null;
  callRequestLabel?: string | null;

  roomTitle?: string;
  categoryLabel?: string;

  onProfileEdit: () => void;
  onInviteFriends: () => void;
  onHome?: () => void;
  onExit: () => void;
  /** Optional screen-share handler. Hidden when omitted. */
  onScreenShare?: () => void;
  screenShareActive?: boolean;
  screenShareDisabled?: boolean;

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

type SurfaceTab = "board" | "chat";

function DockMicIcon({ muted }: { muted: boolean }) {
  return (
    <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
      {muted ? "🔇" : "🎤"}
    </span>
  );
}

function DockSpeakerIcon({ on }: { on: boolean }) {
  return (
    <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
      {on ? "🔊" : "🔈"}
    </span>
  );
}

function DockShareIcon() {
  return (
    <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
      ⧉
    </span>
  );
}

function DockExitIcon() {
  return (
    <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
      ✕
    </span>
  );
}

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
  classVoteSlot,
  presenceToasts,
  filled,
  capacity,
  membersSyncRevision,
  membersLocked = false,
  showCallStuckReconnect = false,
  onCallStuckReconnect,
  meetingPlanLabel,
  callRequestLabel,
  roomTitle = "通話ルーム",
  categoryLabel = "フリークラス",
  onProfileEdit,
  onInviteFriends,
  onHome,
  onExit,
  onScreenShare,
  screenShareActive = false,
  screenShareDisabled = false,
  fetchErrorCount = 0,
  showWaitingForOthers = false,
  visibleMembers,
  deviceId,
  classId = "",
  sessionId = "",
  nowMs,
  getMemberStatus: _getMemberStatus,
  peerDiagnostics = {},
  remoteAudioHealth = {},
  wasPeerConnected,
  onMemberClick,
  onManualAudioReconnect,
  showMemberModeration = true,
  resolveStatusDisplayText: _resolveStatusDisplayText = true,
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
}: CallRoomViewProps) {
  const inAppShell = isAppShellContext();
  const [surfaceTab, setSurfaceTab] = useState<SurfaceTab>("board");
  const [speakerOn, setSpeakerOnState] = useState(() => getCallSpeakerOn());

  useEffect(() => subscribeCallSpeaker(() => setSpeakerOnState(getCallSpeakerOn())), []);

  const countLabel =
    membersSyncRevision > 0
      ? `${filled}/${capacity}人`
      : `--/${capacity}人`;

  const avatarMembers = useMemo((): RoomAvatarStripMember[] => {
    return visibleMembers.map((m) => {
      const did = String(m.device_id ?? "").trim();
      const isMe = did === String(deviceId ?? "").trim();
      const speaking =
        !!m.lastSpokeAt && nowMs > 0 && nowMs - m.lastSpokeAt < 1500;
      return {
        id: did || formatMemberDisplayName(m),
        label: isMe
          ? `${formatMemberDisplayName(m)}`
          : formatMemberDisplayName(m),
        photoPath: m.photo_path,
        avatarUrl: m.avatar_url ?? null,
        isMe,
        badge: speaking ? "発話中" : null,
      };
    });
  }, [visibleMembers, deviceId, nowMs]);

  const micOn = !userMuted && muteButtonLabel !== "聞き専";
  const micListen = muteButtonLabel === "聞き専";
  const micLabel = micListen ? "聞き専" : userMuted ? "ミュート" : "マイク";

  const moderationTargets = showMemberModeration
    ? visibleMembers.filter((m) => {
        const did = normalizeMemberDeviceId(m.device_id);
        return did && did !== deviceId;
      })
    : [];

  const debugReconnectMembers = isVoiceLayerDebugEnabled()
    ? visibleMembers.filter((member) => {
        const memberId = member.device_id ?? "";
        if (!memberId || memberId === deviceId || !onManualAudioReconnect) {
          return false;
        }
        const diag = peerDiagnostics[memberId];
        const memberAudioHealth = remoteAudioHealth[memberId] ?? null;
        return resolveDisplayManualAudioReconnect({
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
          trackReady: memberAudioHealth?.trackReady ?? diag?.trackReady ?? "-",
          liveStreamHealHold: diag?.liveStreamHealHold === true,
          p2pDirectFailedHoldActive: diag?.p2pDirectFailedHoldActive === true,
          autoHardResetInProgress: diag?.autoHardResetInProgress === true,
          voicePeerRepairInProgress: diag?.voicePeerRepairInProgress === true,
          autoHardResetGiveUp: diag?.autoHardResetGiveUp === true,
          reconnectRequestPending: diag?.reconnectRequestPending === true,
          wasPeerConnected: wasPeerConnected?.(memberId) === true,
          nowMs,
          debugUi: true,
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
      })
    : [];

  return (
    <main
      className={[
        "cm-classroom-scope",
        "cm-call-root",
        "cm-call-root--redesign",
        "cm-call-root--hero-v2",
        inAppShell ? "app-immersive-inner app-immersive-inner--wide" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        inAppShell ? undefined : { maxWidth: 980, margin: "0 auto" }
      }
    >
      <CallPresenceToastStack toasts={presenceToasts} />

      {voiceLayer}

      {entryGateSlot}

      <div className="cm-call-hero-stack">
        <RoomSessionHero
          title={roomTitle}
          categoryLabel={categoryLabel}
          countLabel={countLabel}
          statusLabel="通話中"
          statusTone="incall"
          toolbarLeft={
            onHome ? (
              <button
                type="button"
                className="cm-room-ghost-btn cm-room-session-hero-iconbtn"
                onClick={onHome}
                aria-label="ホーム"
              >
                ←
              </button>
            ) : (
              <span />
            )
          }
          toolbarRight={
            <>
              <button
                type="button"
                className="cm-room-ghost-btn cm-room-session-hero-iconbtn"
                onClick={onProfileEdit}
                aria-label="プロフィール編集"
                title="プロフィール編集"
              >
                ⚙
              </button>
            </>
          }
          avatarStrip={
            <RoomAvatarStrip
              members={avatarMembers}
              capacity={capacity}
              onInvite={onInviteFriends}
              inviteDisabled={!sessionId || !classId}
              onMemberClick={(member) => {
                const raw = visibleMembers.find(
                  (m) => String(m.device_id ?? "").trim() === member.id
                );
                if (!raw) return;
                onMemberClick?.(raw);
              }}
            />
          }
        />

        {(meetingPlanLabel || callRequestLabel) && (
          <div className="cm-call-inline-banners">
            {meetingPlanLabel ? (
              <div className="cm-call-meta" style={{ fontSize: 12, fontWeight: 800 }}>
                {meetingPlanLabel}
              </div>
            ) : null}
            {callRequestLabel ? (
              <div
                className="cm-call-meta cm-call-meta--accent"
                style={{ fontSize: 12, fontWeight: 800, color: "#92400e" }}
              >
                {callRequestLabel}
              </div>
            ) : null}
          </div>
        )}

        <div className="cm-call-inline-banners">
          {fetchErrorCount >= 3 ? (
            <div
              className="cm-call-banner cm-call-banner--warn"
              style={{
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
          ) : null}

          {showWaitingForOthers ? (
            <div
              className="cm-call-banner cm-call-banner--wait"
              style={{
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

          {isVoiceLayerDebugEnabled() && showCallStuckReconnect ? (
            <div
              className="cm-call-stuck"
              style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
            >
              <span style={{ fontSize: 13, color: "#92400e", fontWeight: 800 }}>
                接続処理が長時間続いています
              </span>
              <button
                type="button"
                className="cm-call-warn-btn"
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

          {bannerSlot}
          {classVoteSlot}

          {showMicPermissionWarning ? (
            <div
              className="cm-call-banner cm-call-banner--warn"
              style={{
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
                  className="cm-call-warn-btn"
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
                    minHeight: 44,
                  }}
                >
                  もう一度試す
                </button>
              ) : null}
            </div>
          ) : null}

          {voiceJoinFatalError ? (
            <div
              className="cm-call-banner cm-call-banner--error"
              style={{
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
                  className="cm-cta-secondary cm-call-reconnect-btn"
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
                    minHeight: 44,
                  }}
                >
                  音声を再接続
                </button>
              ) : null}
            </div>
          ) : voiceSelfReconnecting ? (
            <div className="cm-call-reconnecting" style={{ fontSize: 12, color: "#9ca3af" }}>
              再接続中…
            </div>
          ) : null}

          {debugReconnectMembers.map((member) => {
            const memberId = member.device_id;
            return (
              <button
                key={`reconnect-${memberId}`}
                type="button"
                className="cm-call-warn-btn"
                onClick={() => onManualAudioReconnect?.(memberId)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #f59e0b",
                  background: "#fffbeb",
                  color: "#b45309",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  width: "fit-content",
                }}
              >
                {formatMemberDisplayName(member)} の音声を再接続
              </button>
            );
          })}
        </div>

        <div className="cm-call-dock" role="toolbar" aria-label="通話操作">
          <button
            type="button"
            className={[
              "cm-call-dock-item",
              micListen
                ? "cm-call-dock-item--listen"
                : micOn
                  ? "cm-call-dock-item--mic-on"
                  : "cm-call-dock-item--mic-off",
            ].join(" ")}
            disabled={muteDisabled || !micReady}
            onClick={onMuteClick}
            aria-label={muteButtonLabel}
            aria-pressed={micOn}
          >
            <span className="cm-call-dock-icon">
              <DockMicIcon muted={!micOn} />
            </span>
            <span className="cm-call-dock-label">{micLabel}</span>
          </button>

          <button
            type="button"
            className={[
              "cm-call-dock-item",
              speakerOn ? "" : "cm-call-dock-item--speaker-off",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setCallSpeakerOn(!speakerOn)}
            aria-label={speakerOn ? "スピーカー オン" : "スピーカー オフ"}
            aria-pressed={speakerOn}
          >
            <span className="cm-call-dock-icon">
              <DockSpeakerIcon on={speakerOn} />
            </span>
            <span className="cm-call-dock-label">
              {speakerOn ? "スピーカー" : "消音"}
            </span>
          </button>

          <button
            type="button"
            className="cm-call-dock-item"
            onClick={() => onScreenShare?.()}
            disabled={!onScreenShare || screenShareDisabled}
            aria-label={
              onScreenShare
                ? screenShareActive
                  ? "画面共有を停止"
                  : "画面共有"
                : "画面共有（準備中）"
            }
            title={onScreenShare ? undefined : "画面共有は準備中です"}
          >
            <span className="cm-call-dock-icon">
              <DockShareIcon />
            </span>
            <span className="cm-call-dock-label">
              {screenShareActive ? "共有中" : "共有"}
            </span>
          </button>

          <button
            type="button"
            className="cm-call-dock-item cm-call-dock-item--exit cm-call-exit-btn"
            onClick={onExit}
            aria-label="退出"
          >
            <span className="cm-call-dock-icon">
              <DockExitIcon />
            </span>
            <span className="cm-call-dock-label">退出</span>
          </button>
        </div>

        <section className="cm-call-surface" aria-label="黒板とチャット">
          <div className="cm-call-surface-tabs" role="tablist" aria-label="表示切替">
            <button
              type="button"
              role="tab"
              aria-selected={surfaceTab === "board"}
              className={[
                "cm-call-surface-tab",
                surfaceTab === "board" ? "cm-call-surface-tab--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSurfaceTab("board")}
            >
              黒板
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={surfaceTab === "chat"}
              className={[
                "cm-call-surface-tab",
                surfaceTab === "chat" ? "cm-call-surface-tab--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSurfaceTab("chat")}
            >
              チャット
            </button>
          </div>

          <div
            className={[
              "cm-call-surface-panel",
              surfaceTab === "board" ? "" : "cm-call-surface-panel--inactive",
            ]
              .filter(Boolean)
              .join(" ")}
            role="tabpanel"
            aria-hidden={surfaceTab !== "board"}
          >
            {boardSlot}
          </div>
          <div
            className={[
              "cm-call-surface-panel",
              surfaceTab === "chat" ? "" : "cm-call-surface-panel--inactive",
            ]
              .filter(Boolean)
              .join(" ")}
            role="tabpanel"
            aria-hidden={surfaceTab !== "chat"}
          >
            {messagesSlot}
          </div>
        </section>

        {moderationTargets.length > 0 && classId && sessionId ? (
          <details
            className="cm-call-inline-banners"
            style={{ marginBottom: 8 }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 800,
                color: "#64748b",
                listStyle: "none",
              }}
            >
              メンバー管理
            </summary>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {moderationTargets.map((member) => (
                <div
                  key={member.device_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {formatMemberDisplayName(member)}
                  </span>
                  <MemberModerationButtons
                    myDeviceId={deviceId}
                    targetDeviceId={member.device_id}
                    targetName={formatMemberDisplayName(member)}
                    sessionId={sessionId}
                    classId={classId}
                  />
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      {profileModalSlot}
    </main>
  );
}
