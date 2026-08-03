"use client";

import { useMemo, useState } from "react";
import CallRoomView, {
  type CallRoomViewMember,
  type CallRoomViewMemberStatus,
} from "@/app/call/CallRoomView";
import SharedCanvasBoard from "@/app/call/SharedCanvasBoard";

/**
 * Production chrome fixture for screenshot comparison.
 * Uses CallRoomView exactly as CallClient does — dummy data only.
 */
export default function CallProdChromeFixture() {
  const [userMuted, setUserMuted] = useState(false);
  const nowMs = Date.now();

  const visibleMembers: CallRoomViewMember[] = useMemo(
    () => [
      {
        device_id: "prod-self",
        display_name: "自分",
        photo_path: null,
        avatar_url: "/default-avatar.jpg",
        is_in_call: true,
        screen: "call",
        lastSpokeAt: nowMs - 400,
      },
      {
        device_id: "prod-a",
        display_name: "ユーザーA",
        photo_path: null,
        avatar_url: "/demo/user-a.svg",
        is_in_call: true,
        screen: "call",
        lastSpokeAt: nowMs - 200,
      },
      {
        device_id: "prod-b",
        display_name: "ユーザーB",
        photo_path: null,
        avatar_url: "/demo/user-b.svg",
        is_in_call: true,
        screen: "call",
      },
    ],
    [nowMs]
  );

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
    if (member.device_id === "prod-self" && userMuted) {
      return {
        text: "自分 / ミュート中",
        color: "#6b7280",
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

  return (
    <CallRoomView
      presenceToasts={[]}
      filled={3}
      capacity={5}
      membersSyncRevision={1}
      onProfileEdit={() => undefined}
      onInviteFriends={() => undefined}
      onExit={() => undefined}
      visibleMembers={visibleMembers}
      deviceId="prod-self"
      nowMs={nowMs}
      getMemberStatus={getMemberStatus}
      showMemberModeration={false}
      resolveStatusDisplayText={false}
      userMuted={userMuted}
      micReady
      muteButtonLabel={userMuted ? "ミュート解除" : "ミュート"}
      onMuteClick={() => setUserMuted((v) => !v)}
      micLevel={userMuted ? 0 : 0.12}
      boardSlot={
        <SharedCanvasBoard
          sessionId="prod-chrome-preview"
          previewOnly
          previewOverlayText={"今日のテーマ\n最近ハマっていること"}
        />
      }
      messagesSlot={
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            background: "#fff",
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 15 }}>メッセージ</div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
            （比較用フィクスチャ — 本番では SessionMessages が入ります）
          </div>
        </div>
      }
    />
  );
}
