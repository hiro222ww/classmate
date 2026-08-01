"use client";

/**
 * Marketing / screenshot demo call room.
 * Display-only: no live voice stack, mic acquire, realtime, session APIs, or push.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CallRoomStage, {
  type CallRoomStageMember,
} from "@/components/call/CallRoomStage";
import CallDemoControlPanel from "./CallDemoControlPanel";
import type { CallPresenceToast } from "@/lib/callPresenceToasts";
import {
  applySpeakingSelection,
  createDefaultCallDemoState,
  createPresetState,
  visibleDemoMembers,
} from "@/lib/callDemo/defaults";
import {
  clearCallDemoState,
  loadCallDemoState,
  saveCallDemoState,
} from "@/lib/callDemo/storage";
import type {
  CallDemoPresetId,
  CallDemoState,
} from "@/lib/callDemo/types";
import { setMemberNameCache, type MemberNameCache } from "@/lib/memberNameCache";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return !!target.closest("[data-call-demo-panel='1'] input, [data-call-demo-panel='1'] textarea, [data-call-demo-panel='1'] select");
}

function statusForMember(
  state: CallDemoState,
  member: { online: boolean; inCall: boolean; listenOnly: boolean; muted: boolean }
): string {
  if (state.uiScene === "reconnecting") return "再接続中";
  if (state.uiScene === "connecting") return "接続中";
  if (!member.online) return "オフライン";
  if (!member.inCall) return "オンライン";
  if (member.listenOnly) return "聞き専";
  if (member.muted) return "ミュート";
  return "通話中";
}

export default function CallDemoClient() {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<CallDemoState>(() =>
    createDefaultCallDemoState()
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [toasts, setToasts] = useState<CallPresenceToast[]>([]);
  const nameCacheRef = useRef<MemberNameCache>(new Map());
  const toastToggleRef = useRef<"join" | "leave">("join");

  useEffect(() => {
    setState(loadCallDemoState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveCallDemoState(state);
  }, [state, hydrated]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  // Keep name cache warm for toast display names (reuse production helper).
  useEffect(() => {
    for (const member of state.members) {
      setMemberNameCache(nameCacheRef.current, {
        userId: member.id,
        memberId: member.id,
        deviceId: member.id,
        displayName: member.displayName,
      });
    }
  }, [state.members]);

  const syncSpeaking = useCallback((next: CallDemoState): CallDemoState => {
    if (!next.autoSpeak && !next.dualSpeak) {
      // Keep manual speaking flags from members when auto is off.
      return next;
    }
    return {
      ...next,
      members: applySpeakingSelection(
        next.members,
        next.memberCount,
        next.speakIndex,
        next.dualSpeak
      ),
    };
  }, []);

  const updateState = useCallback(
    (next: CallDemoState | ((prev: CallDemoState) => CallDemoState)) => {
      setState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        return syncSpeaking(resolved);
      });
    },
    [syncSpeaking]
  );

  useEffect(() => {
    if (!state.autoSpeak) return;
    const timer = window.setInterval(() => {
      setState((prev) => {
        if (!prev.autoSpeak) return prev;
        const speakIndex = prev.speakIndex + 1;
        return syncSpeaking({ ...prev, speakIndex });
      });
    }, state.autoSpeakIntervalMs);
    return () => window.clearInterval(timer);
  }, [state.autoSpeak, state.autoSpeakIntervalMs, syncSpeaking]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const pushToast = useCallback(
    (kind: "join" | "leave", memberId?: string) => {
      const pool = state.members.slice(0, Math.max(state.memberCount, 1));
      const target =
        pool.find((m) => m.id === memberId) ||
        pool.find((m) => !m.isSelf) ||
        pool[0];
      if (!target) return;
      const cached = nameCacheRef.current.get(target.id);
      const displayName =
        cached?.displayName || target.displayName.trim() || "参加者";
      const now = Date.now();
      const message =
        kind === "join"
          ? `${displayName}さんが通話に参加しました`
          : `${displayName}さんが通話から退出しました`;
      setToasts((prev) =>
        [
          ...prev,
          {
            id: `${kind}:${target.id}:${now}`,
            kind,
            deviceId: target.id,
            displayName,
            message,
            createdAt: now,
          },
        ].slice(-6)
      );
    },
    [state.memberCount, state.members]
  );

  const playJoinToast = useCallback(() => {
    toastToggleRef.current = "leave";
    pushToast("join");
  }, [pushToast]);

  const playLeaveToast = useCallback(() => {
    toastToggleRef.current = "join";
    pushToast("leave");
  }, [pushToast]);

  const playToastToggle = useCallback(() => {
    if (toastToggleRef.current === "join") playJoinToast();
    else playLeaveToast();
  }, [playJoinToast, playLeaveToast]);

  const joinMember = useCallback(() => {
    updateState((prev) => {
      if (prev.memberCount >= 5) {
        pushToast("join");
        return prev;
      }
      const memberCount = (prev.memberCount + 1) as 1 | 2 | 3 | 4 | 5;
      const members = prev.members.map((m, i) =>
        i === memberCount - 1
          ? { ...m, inCall: true, online: true, speaking: false }
          : m
      );
      const joining = members[memberCount - 1];
      window.setTimeout(() => pushToast("join", joining?.id), 0);
      return {
        ...prev,
        memberCount,
        members,
        uiScene: "member_join",
        board: { ...prev.board, statusText: "メンバー追加" },
      };
    });
  }, [pushToast, updateState]);

  const leaveMember = useCallback(() => {
    updateState((prev) => {
      if (prev.memberCount <= 1) {
        pushToast("leave");
        return prev;
      }
      const leaving = prev.members[prev.memberCount - 1];
      window.setTimeout(() => pushToast("leave", leaving?.id), 0);
      const memberCount = (prev.memberCount - 1) as 1 | 2 | 3 | 4 | 5;
      const members = prev.members.map((m, i) =>
        i === prev.memberCount - 1
          ? { ...m, inCall: false, speaking: false }
          : m
      );
      return {
        ...prev,
        memberCount,
        members,
        uiScene: "member_leave",
        board: { ...prev.board, statusText: "メンバー退出" },
      };
    });
  }, [pushToast, updateState]);

  const moveToCall = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      members: prev.members.map((m, i) =>
        i < prev.memberCount ? { ...m, inCall: true, online: true } : m
      ),
      uiScene: "connected",
      board: { ...prev.board, statusText: "通話中" },
    }));
  }, [updateState]);

  const moveToWaiting = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      members: prev.members.map((m, i) =>
        i < prev.memberCount
          ? { ...m, inCall: false, speaking: false, online: true }
          : m
      ),
      uiScene: "waiting",
      board: { ...prev.board, statusText: "待機中" },
    }));
  }, [updateState]);

  const cycleSpeak = useCallback(
    (delta: number) => {
      updateState((prev) => ({
        ...prev,
        autoSpeak: false,
        speakIndex: prev.speakIndex + delta,
        members: applySpeakingSelection(
          prev.members,
          prev.memberCount,
          prev.speakIndex + delta,
          prev.dualSpeak
        ),
      }));
    },
    [updateState]
  );

  const clearSpeaking = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      autoSpeak: false,
      members: prev.members.map((m) => ({ ...m, speaking: false })),
    }));
  }, [updateState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const key = event.key;

      if (key === "d" || key === "D") {
        event.preventDefault();
        setState((prev) => ({ ...prev, filmingMode: !prev.filmingMode }));
        return;
      }
      if (key >= "1" && key <= "5") {
        event.preventDefault();
        const memberCount = Number(key) as 1 | 2 | 3 | 4 | 5;
        updateState((prev) => ({ ...prev, memberCount }));
        return;
      }
      if (key === " ") {
        event.preventDefault();
        updateState((prev) => ({ ...prev, autoSpeak: !prev.autoSpeak }));
        return;
      }
      if (key === "ArrowLeft") {
        event.preventDefault();
        cycleSpeak(-1);
        return;
      }
      if (key === "ArrowRight") {
        event.preventDefault();
        cycleSpeak(1);
        return;
      }
      if (key === "t" || key === "T") {
        event.preventDefault();
        playToastToggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleSpeak, playToastToggle, updateState]);

  const visible = useMemo(() => visibleDemoMembers(state), [state]);

  const stageMembers: CallRoomStageMember[] = useMemo(() => {
    return visible.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      isSelf: m.isSelf,
      speaking: m.speaking,
      lastSpokeAt: m.speaking ? nowMs : null,
      statusText: statusForMember(state, m),
      muted: m.muted || (m.isSelf && state.selfMuted),
      listenOnly: m.listenOnly || (m.isSelf && state.selfListenOnly),
      genderLabel: m.genderLabel,
      ageLabel: m.ageLabel,
    }));
  }, [visible, nowMs, state]);

  const selfMember = state.members.find((m) => m.isSelf);
  const selfMuted = state.selfMuted || selfMember?.muted === true;
  const selfListenOnly =
    state.selfListenOnly || selfMember?.listenOnly === true;
  const muteButtonLabel = selfListenOnly
    ? "聞き専"
    : selfMuted
      ? "ミュート解除"
      : "ミュート";

  const micLevel =
    selfMuted || selfListenOnly
      ? 0
      : state.autoSpeak || stageMembers.some((m) => m.isSelf && m.speaking)
        ? Math.max(0.08, state.micLevel)
        : 0.02;

  if (!hydrated) {
    return <p style={{ padding: 16 }}>デモを読み込み中…</p>;
  }

  return (
    <>
      <CallRoomStage
        title="通話ルーム"
        filled={visible.length}
        capacity={state.capacity}
        members={stageMembers}
        toasts={toasts}
        board={state.board}
        uiScene={state.uiScene}
        showDemoBadge={state.showDemoBadge}
        selfMuted={selfMuted}
        selfListenOnly={selfListenOnly}
        micLevel={micLevel}
        muteButtonLabel={muteButtonLabel}
        onMuteClick={() =>
          updateState((prev) => ({ ...prev, selfMuted: !prev.selfMuted }))
        }
        showExitConfirm={state.uiScene === "exit_confirm"}
        onConfirmExit={() =>
          updateState((prev) => ({
            ...prev,
            uiScene: "call_ended",
            board: { ...prev.board, statusText: "通話終了" },
          }))
        }
        onCancelExit={() =>
          updateState((prev) => ({ ...prev, uiScene: "connected" }))
        }
        nowMs={nowMs}
      />

      {!state.filmingMode ? (
        <CallDemoControlPanel
          state={state}
          onChange={updateState}
          onPreset={(id: CallDemoPresetId) =>
            updateState(createPresetState(id))
          }
          onReset={() => {
            clearCallDemoState();
            updateState(createDefaultCallDemoState());
          }}
          onPlayJoinToast={playJoinToast}
          onPlayLeaveToast={playLeaveToast}
          onJoinMember={joinMember}
          onLeaveMember={leaveMember}
          onMoveToCall={moveToCall}
          onMoveToWaiting={moveToWaiting}
          onClearSpeaking={clearSpeaking}
          onCycleSpeak={cycleSpeak}
        />
      ) : null}
    </>
  );
}
