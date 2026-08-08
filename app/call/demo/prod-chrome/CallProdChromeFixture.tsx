"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CallRoomView, {
  type CallRoomViewMember,
  type CallRoomViewMemberStatus,
} from "@/app/call/CallRoomView";
import { MicEntryGate } from "@/components/MicEntryGate";
import SharedCanvasBoard from "@/app/call/SharedCanvasBoard";
import type { CallPresenceToast } from "@/lib/callPresenceToasts";

export type CallChromeScene =
  | "prep"
  | "mic_denied"
  | "mic_preparing"
  | "listen_only"
  | "connecting"
  | "reconnecting"
  | "solo"
  | "multi"
  | "empty_seats"
  | "connection_error"
  | "stuck"
  | "toast";

/**
 * Production chrome fixture for screenshot comparison.
 * Uses CallRoomView exactly as CallClient does — dummy data only.
 * Optional ?scene= switches presentational props only (no WebRTC).
 */
export default function CallProdChromeFixture() {
  const searchParams = useSearchParams();
  const scene = (searchParams.get("scene") as CallChromeScene) || "multi";
  const [userMuted, setUserMuted] = useState(false);
  const nowMs = Date.now();

  const capacity = scene === "solo" ? 5 : 5;
  const memberCount =
    scene === "solo"
      ? 1
      : scene === "empty_seats" || scene === "prep" || scene === "mic_denied"
        ? 1
        : scene === "multi" ||
            scene === "connecting" ||
            scene === "reconnecting" ||
            scene === "listen_only" ||
            scene === "mic_preparing" ||
            scene === "connection_error" ||
            scene === "stuck" ||
            scene === "toast"
          ? 3
          : 3;

  const visibleMembers: CallRoomViewMember[] = useMemo(() => {
    const base: CallRoomViewMember[] = [
      {
        device_id: "prod-self",
        display_name: "自分",
        photo_path: null,
        avatar_url: "/default-avatar.jpg",
        is_in_call: true,
        screen: "call",
        lastSpokeAt:
          scene === "multi" || scene === "toast" ? nowMs - 400 : undefined,
      },
      {
        device_id: "prod-a",
        display_name: "ユーザーA",
        photo_path: null,
        avatar_url: "/demo/user-a.svg",
        is_in_call: true,
        screen: "call",
        lastSpokeAt:
          scene === "multi" || scene === "toast" ? nowMs - 200 : undefined,
      },
      {
        device_id: "prod-b",
        display_name: "ユーザーB",
        photo_path: null,
        avatar_url: "/demo/user-b.svg",
        is_in_call: scene !== "empty_seats",
        screen: scene === "empty_seats" ? "room" : "call",
      },
    ];
    return base.slice(0, memberCount);
  }, [memberCount, nowMs, scene]);

  const getMemberStatus = (
    member?: CallRoomViewMember
  ): CallRoomViewMemberStatus => {
    if (!member) {
      return {
        text: "待機ルーム内",
        color: "#9ca3af",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
      };
    }
    if (scene === "connecting") {
      return {
        text: "接続中",
        color: "#92400e",
        chipBg: "#fffbeb",
        chipText: "#b45309",
      };
    }
    if (scene === "reconnecting") {
      return {
        text: "再接続中",
        color: "#92400e",
        chipBg: "#fffbeb",
        chipText: "#b45309",
      };
    }
    if (scene === "listen_only" && member.device_id === "prod-self") {
      return {
        text: "聞き専",
        color: "#6b7280",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
      };
    }
    if (member.device_id === "prod-self" && userMuted) {
      return {
        text: "自分 / ミュート中",
        color: "#6b7280",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
      };
    }
    if (member.screen === "room" || member.is_in_call === false) {
      return {
        text: "待機ルーム内",
        color: "#9ca3af",
        chipBg: "#f3f4f6",
        chipText: "#6b7280",
      };
    }
    return {
      text: "通話中",
      color: "#166534",
      chipBg: "#dcfce7",
      chipText: "#166534",
    };
  };

  const showGate = scene === "prep" || scene === "mic_denied";
  const listenOnly = scene === "listen_only";
  const presenceToasts: CallPresenceToast[] =
    scene === "toast"
      ? [
          {
            id: "toast-join",
            kind: "join",
            deviceId: "prod-a",
            displayName: "ユーザーA",
            message: "ユーザーA が入室しました",
            createdAt: nowMs,
          },
        ]
      : [];

  return (
    <CallRoomView
      entryGateSlot={
        showGate ? (
          <MicEntryGate
            busy={false}
            errorTitle={
              scene === "mic_denied" ? "マイクが許可されていません" : undefined
            }
            errorBody={
              scene === "mic_denied"
                ? "ブラウザの設定からマイクを許可してから、もう一度お試しください。"
                : undefined
            }
            onRequestMic={() => undefined}
            onListenOnly={() => undefined}
          />
        ) : null
      }
      presenceToasts={presenceToasts}
      filled={visibleMembers.length}
      capacity={capacity}
      membersSyncRevision={1}
      showCallStuckReconnect={scene === "stuck"}
      onCallStuckReconnect={scene === "stuck" ? () => undefined : undefined}
      onProfileEdit={() => undefined}
      onInviteFriends={() => undefined}
      onExit={() => undefined}
      showWaitingForOthers={scene === "prep" || scene === "solo"}
      visibleMembers={visibleMembers}
      deviceId="prod-self"
      nowMs={nowMs}
      getMemberStatus={getMemberStatus}
      showMemberModeration={false}
      resolveStatusDisplayText={false}
      showMicPermissionWarning={scene === "mic_preparing"}
      micPermissionWarningTitle="マイク準備中…"
      micPermissionWarningBody="マイクの準備が完了するまでお待ちください。"
      onRetryMic={
        scene === "mic_preparing" ? () => undefined : undefined
      }
      voiceJoinFatalError={scene === "connection_error"}
      onVoiceReconnect={
        scene === "connection_error" ? () => undefined : undefined
      }
      voiceSelfReconnecting={scene === "reconnecting"}
      muteDisabled={listenOnly}
      userMuted={listenOnly ? true : userMuted}
      micReady={!listenOnly && scene !== "mic_preparing"}
      muteButtonLabel={
        listenOnly ? "聞き専" : userMuted ? "ミュート解除" : "ミュート"
      }
      onMuteClick={() => setUserMuted((v) => !v)}
      micLevel={
        listenOnly || userMuted || scene === "mic_preparing" ? 0 : 0.12
      }
      boardSlot={
        <SharedCanvasBoard
          sessionId="prod-chrome-preview"
          previewOnly
          previewOverlayText={"今日のテーマ\n最近ハマっていること"}
        />
      }
      messagesSlot={
        <div
          className="cm-paper-card"
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            background: "#fff",
            padding: 14,
          }}
        >
          <div className="cm-section-title" style={{ fontWeight: 900, fontSize: 15 }}>
            メッセージ
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
            （比較用フィクスチャ — 本番では SessionMessages が入ります）
          </div>
        </div>
      }
    />
  );
}
