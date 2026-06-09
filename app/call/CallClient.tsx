"use client";

import { debugConsoleLog, debugConsoleInfo } from "@/lib/debugVoiceLog";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SharedCanvasBoard from "./SharedCanvasBoard";
import CallVoiceLayer from "./CallVoiceLayer";
import { releaseSessionMic } from "./voice/useLocalMic";
import { supabase } from "@/lib/supabaseClient";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";
import {
  buildCurrentPathReturnTo,
  buildProfileEditPath,
} from "@/lib/profileNavigation";
import SessionMessages from "@/components/SessionMessages";
import YouTubeWatchParty from "./YouTubeWatchParty";
import MemberModerationButtons from "@/components/MemberModerationButtons";
import MemberProfileModal from "@/components/MemberProfileModal";
import {
  formatMemberDisplayName,
  logMemberDisplayNamesFromApi,
} from "@/lib/resolveDisplayName";
import {
  compactMemberDeviceIds,
  diffMemberDeviceIds,
  evaluateMemberListApply,
  logRoomMembersBeforeUpdate,
  logRoomMembersEmptyIgnored,
  logRoomMembersRemoved,
  MEMBER_LIST_EMPTY_STREAK_REQUIRED,
} from "@/lib/memberListGuard";
import {
  countPresenceStates,
  getPresenceFreshMsForContext,
  logMemberSource,
  mergeSessionMembersPreservingRemoved,
} from "@/lib/sessionMemberListMerge";
import { areMembersListEquivalent } from "@/lib/memberListEquality";
import {
  CALL_READY_STUCK_MS,
  logCallReadyCheck,
  logCallReadyStuck,
  resolveCallReadyStuckReason,
  type CallReadinessSnapshot,
} from "@/lib/callReadiness";
import {
  computeRemoteMemberIds,
  logCallMembersDebug,
  logCallRender,
  logVoiceLayerRenderCheck,
  resolveVoiceLayerBlockingReason,
} from "@/lib/callDiagnostics";
import { logDeviceIdStability } from "@/lib/deviceDiagnostics";
import {
  installCallPageDiagnostics,
  logCallLifecycle,
  logCallStatusPeer,
  logVoiceUnstable,
  voiceDebugLog,
  isVoiceLayerDebugEnabled,
  setRemoteAudioPipelinePeerContext,
  type PeerStatusDiagnostics,
} from "@/app/call/voice/voiceDiagnostics";
import {
  getCurrentPath,
  logNavigationIntent,
  logRouteChange,
  readCallMutePreference,
  resolveCallEntryUserMuted,
  restoreCallSessionAfterReload,
  writeCallMutePreference,
} from "@/lib/callLifecycle";
import { clearCallBfcacheSuspend } from "@/lib/callReloadDiagnostics";
import { requestRemoteAudioUnlock } from "@/lib/remoteAudioUnlock";
import {
  LIST_MEMBER_AVATAR_PX,
  normalizeMemberDeviceId,
  type MemberProfileTarget,
} from "@/lib/memberProfileView";
import MemberListAvatar from "@/components/MemberListAvatar";
import { debugVoiceRetryable } from "@/lib/debugVoiceLog";
import {
  getBackgroundSyncIntervalMs,
  logAppLife,
} from "@/lib/appLifecycle";
import { fetchWithRetry, isIntentionalAbortError } from "@/lib/retryableFetch";
import {
  logVoicePerfPipeline,
  markVoicePerf,
  resetVoicePerfSession,
} from "@/lib/voicePerf";
import { resetSessionVoiceCache } from "@/lib/sessionVoiceCache";
import {
  applyCallMemberInCallHysteresis,
  shouldStartCallMemberInCallHysteresis,
} from "@/lib/callMemberInCallHysteresis";
import "@/lib/voiceConnectionDiagnostics";
import { isStableVoiceJoinMode } from "@/lib/stableVoiceJoin";
import { buildVoiceConnectionMembers } from "@/lib/voiceSessionMembers";
import type { MeetingPlanPublic } from "@/lib/meetingPlanClient";
import type { CallRequestPublic } from "@/lib/callRequest";
import {
  logParticipationStatusDecision,
  isRecentPlaySuccess,
  isRemoteAudioHealthyNow,
  applyCallMemberStatusHysteresis,
  computeAudioUnhealthySinceMs,
  resolveCallMemberStatus,
  resolveDisplayManualAudioReconnect,
  resolveEffectivePeerConnection,
  type PeerLabelHysteresisState,
} from "@/lib/memberPresenceStatus";
import {
  logInitialSafetyMute,
  logMuteStateSet,
  logRestoreMutedState,
} from "@/lib/localMicMuteState";
import type { RemotePlaybackHealth } from "@/app/call/voice/RemoteAudio";
import {
  clearLocalLeftCall,
  hasLocalLeftCall,
  LOCAL_LEFT_CALL_EXPLICIT_REASON,
  markLocalLeftCall,
} from "@/lib/localCallExit";

type Member = {
  device_id: string;
  display_name: string;
  photo_path: string | null;
  avatar_url?: string | null;
  lastSpokeAt?: number;
  is_in_call?: boolean;
  screen?: string | null;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";

const CALL_MEMBERS_POLL_MS = 15_000;
const CALL_REALTIME_FETCH_DEBOUNCE_MS = 2000;
const CALL_NOW_MS_TICK_MS = 2000;
const MIC_LEVEL_COMMIT_MIN_DELTA = 0.02;
const MIC_LEVEL_COMMIT_MIN_INTERVAL_MS = 250;

function arePeerStatesEqual(
  a: Record<string, PeerState>,
  b: Record<string, PeerState>
): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function arePeerDiagnosticsEqual(
  a: Record<string, PeerStatusDiagnostics>,
  b: Record<string, PeerStatusDiagnostics>
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mapVoiceUnstableReason(
  statusReason: string,
  hasPc: boolean,
  ice: string,
  connection: string
): string {
  if (!hasPc) return "peer_creation_not_started";
  if (ice === "failed") return "ice_failed";
  if (ice === "disconnected") return "ice_disconnected";
  if (connection === "failed") return "connection_failed";
  if (statusReason === "remote_audio_play_failed") return "audio_not_confirmed";
  if (statusReason === "remote_audio_track_ended") return "remote_track_missing";
  if (statusReason === "remote_audio_no_live_stream") return "remote_track_missing";
  if (statusReason === "auto_hard_reset_give_up") return "stale_health";
  if (statusReason === "remote_audio_stalled") return "stale_health";
  return statusReason || "stale_health";
}

type SessionStatusResponse = {
  ok?: boolean;
  session?: {
    id: string;
    class_id?: string;
    topic?: string;
    status?: "forming" | "active" | "closed";
    capacity?: number;
    created_at?: string | null;
  };
  members?: Array<{
    device_id?: string;
    display_name?: string | null;
    display_name_source?: string | null;
    photo_path?: string | null;
    avatar_url?: string | null;
    joined_at?: string | null;
    is_in_call?: boolean | null;
    screen?: string | null;
    last_seen_at?: string | null;
  }>;
  memberCount?: number;
  viewerState?: {
    hasClassMembership: boolean;
    inSessionMembers: boolean;
    inMemberList: boolean;
  };
  error?: string;
};

function getCallNavigationType(): string {
  if (typeof performance === "undefined") return "unknown";
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? "unknown";
}

export default function CallClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sessionId = searchParams.get("sessionId") || "";
  const classId = searchParams.get("classId") || "";

  const [deviceId] = useState(() => getDeviceId());

  useEffect(() => {
    if (!deviceId) return;
    logDeviceIdStability(deviceId, "call");
  }, [deviceId, sessionId, classId]);

  useEffect(() => {
    if (!sessionId) return;
    firstFastMembersAtRef.current = null;
    memberLastInCallAtRef.current = new Map();
    resetVoicePerfSession(sessionId);
    resetSessionVoiceCache(sessionId);
    markVoicePerf("call_screen_mounted");
  }, [sessionId]);

  const profileEditHref = useMemo(
    () =>
      withDev(
        buildProfileEditPath(
          buildCurrentPathReturnTo(pathname, searchParams.toString())
        )
      ),
    [pathname, searchParams]
  );

  const returnTo = useMemo(() => {
    return withDev("/class/select");
  }, []);

  const [members, setMembers] = useState<Member[]>([]);
  const userMutedRef = useRef(true);
  const [userMuted, setUserMuted] = useState(true);
  const localTrackEnabledRef = useRef<boolean | null>(null);
  const muteInitReasonRef = useRef("pending");
  const [micReady, setMicReady] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [callInfo, setCallInfo] = useState("");
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});
  const [peerDiagnostics, setPeerDiagnostics] = useState<
    Record<string, PeerStatusDiagnostics>
  >({});
  const [remoteAudioHealth, setRemoteAudioHealth] = useState<
    Record<string, RemotePlaybackHealth>
  >({});
  const [capacity, setCapacity] = useState(5);
  const [fetchErrorCount, setFetchErrorCount] = useState(0);
  const [nowMs, setNowMs] = useState(0);

  const retryTimerRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);
  const pendingFetchReasonRef = useRef<string | null>(null);
  const lastSpeakerIdRef = useRef<string | null>(null);
  const everConnectedPeersRef = useRef<Set<string>>(new Set());
  const prevCallStatusRef = useRef<Record<string, string>>({});
  const prevCallStatusPeerLogRef = useRef<Record<string, string>>({});
  const peerLabelHysteresisRef = useRef<Record<string, PeerLabelHysteresisState>>({});
  const missingRemoteAudioWarnedRef = useRef<Set<string>>(new Set());
  const manualPeerHardResetRef = useRef<
    (remoteId: string) => void | Promise<void>
  >(() => {});
  const localExitedPeersRef = useRef<Set<string>>(new Set());
  const membersSyncRevisionRef = useRef(0);
  const memberEmptyStreakRef = useRef(0);
  const memberDropStreakRef = useRef(0);
  const firstFastMembersAtRef = useRef<number | null>(null);
  const memberLastInCallAtRef = useRef<Map<string, number>>(new Map());
  const [membersSyncRevision, setMembersSyncRevision] = useState(0);
  const voiceReadinessRef = useRef({
    remoteIds: [] as string[],
    settingsReady: false,
    signalReady: false,
    turnReady: false,
    voiceEnabled: true,
  });
  const callReadySinceRef = useRef<number | null>(null);
  const callReadyStuckLoggedRef = useRef(false);
  const voiceLayerMountedRef = useRef(false);
  const lastCallRenderLogKeyRef = useRef("");
  const callMountAtRef = useRef(Date.now());
  const renderCountRef = useRef(0);
  const lastFetchAtRef = useRef<number | null>(null);
  const realtimeFetchDebounceRef = useRef<number | null>(null);
  const [showCallStuckReconnect, setShowCallStuckReconnect] = useState(false);
  const [profileTarget, setProfileTarget] = useState<MemberProfileTarget | null>(
    null
  );
  const [meetingPlan, setMeetingPlan] = useState<MeetingPlanPublic | null>(null);
  const [callRequest, setCallRequest] = useState<CallRequestPublic | null>(null);

  useEffect(() => {
    userMutedRef.current = userMuted;
  }, [userMuted]);

  useEffect(() => {
    setNowMs(Date.now());

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, CALL_NOW_MS_TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    if (!sessionId || !deviceId) return;

    const resolved = resolveCallEntryUserMuted(sessionId, deviceId);
    const prevMuted = userMutedRef.current;
    userMutedRef.current = resolved.userMuted;
    muteInitReasonRef.current = resolved.reason;
    setUserMuted(resolved.userMuted);

    if (resolved.reason === "initial_call_entry_safety_mute") {
      logInitialSafetyMute({ sessionId, deviceId });
    }

    const restoreReason =
      resolved.reason === "reload_restore"
        ? "reload_restore"
        : resolved.reason;

    logRestoreMutedState({
      stored: resolved.stored,
      userMutedBefore: prevMuted,
      userMutedAfter: resolved.userMuted,
      trackEnabledBefore: localTrackEnabledRef.current,
      trackEnabledAfter: resolved.userMuted ? false : localTrackEnabledRef.current,
      reason: restoreReason,
    });
  }, [sessionId, deviceId]);

  useEffect(() => {
    if (!sessionId || !deviceId) return;

    const restored = restoreCallSessionAfterReload({ sessionId, deviceId });
    if (restored.leftCallSanitized.cleared) {
      localExitedPeersRef.current.delete(deviceId);
    } else if (!hasLocalLeftCall(sessionId, deviceId)) {
      localExitedPeersRef.current.delete(deviceId);
    }

    logCallLifecycle("mount", {
      sessionId,
      deviceId,
      extra: { navigationType: getCallNavigationType() },
    });
    clearCallBfcacheSuspend();
  }, [sessionId, deviceId]);

  useEffect(() => {
    logAppLife("call-client-mount", {
      session: String(sessionId).slice(-6),
      device: String(deviceId).slice(-4),
    });
    return () => {
      logAppLife("call-client-unmount", {
        session: String(sessionId).slice(-6),
        device: String(deviceId).slice(-4),
        members: members.length,
        vis:
          typeof document !== "undefined" ? document.visibilityState : "-",
      });
      logCallLifecycle("unmount", { sessionId, deviceId });
      setPeerStates({});
      setPeerDiagnostics({});
    };
  }, [sessionId, deviceId, members.length]);

  useEffect(() => {
    const unlockRemoteAudio = () => {
      requestRemoteAudioUnlock();
    };

    document.addEventListener("pointerdown", unlockRemoteAudio, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchstart", unlockRemoteAudio, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("pointerdown", unlockRemoteAudio, {
        capture: true,
      });
      document.removeEventListener("touchstart", unlockRemoteAudio, {
        capture: true,
      });
    };
  }, []);

  const prevSessionIdRef = useRef("");
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    if (prev && prev !== sessionId) {
      debugConsoleLog("[call] sessionId changed", {
        from: prev,
        to: sessionId,
        navigationType: getCallNavigationType(),
        currentPath:
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "",
        timestamp: Date.now(),
      });
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    for (const [id, state] of Object.entries(peerStates)) {
      if (state === "connected") {
        everConnectedPeersRef.current.add(id);
      }
    }
    for (const [id, diag] of Object.entries(peerDiagnostics)) {
      const health = remoteAudioHealth[id];
      const effective = resolveEffectivePeerConnection({
        peerState: peerStates[id] ?? "idle",
        remoteTracksCount: diag?.remoteTracksCount ?? 0,
        hasRemoteStream: diag?.hasRemoteStream ?? false,
        trackReady: diag?.trackReady ?? "-",
        lastPlaybackActiveAt: diag?.lastPlaybackActiveAt ?? null,
        lastPlaybackConfirmedAt: diag?.lastPlaybackConfirmedAt ?? null,
        playbackActive:
          health?.playbackActive === true || health?.audioActuallyPlaying === true,
        playbackActiveMode: health?.playbackActiveMode,
        transportUnconfirmed: diag?.transportUnconfirmed === true,
        nowMs,
      });
      if (effective.effectiveConnected) {
        everConnectedPeersRef.current.add(id);
      }
    }
  }, [nowMs, peerDiagnostics, peerStates, remoteAudioHealth]);

  useEffect(() => {
    if (!classId || !deviceId) return;

    let cancelled = false;
    const deferMs = 4000;

    async function loadMeetingPlan() {
      try {
        const res = await fetch(
          `/api/class/meeting-plan?class_id=${encodeURIComponent(classId)}&device_id=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setMeetingPlan(null);
          return;
        }
        setMeetingPlan((json.plan as MeetingPlanPublic | null) ?? null);
      } catch {
        if (!cancelled) setMeetingPlan(null);
      }
    }

    let timer: number | null = null;
    const startTimer = window.setTimeout(() => {
      void loadMeetingPlan();
      timer = window.setInterval(loadMeetingPlan, 60000);
    }, deferMs);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (timer) window.clearInterval(timer);
    };
  }, [classId, deviceId]);

  useEffect(() => {
    if (!classId || !deviceId) return;

    let cancelled = false;
    const deferMs = 4000;

    async function loadCallRequest() {
      try {
        const res = await fetch(
          `/api/class/call-request?class_id=${encodeURIComponent(classId)}&device_id=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setCallRequest(null);
          return;
        }
        setCallRequest((json.request as CallRequestPublic | null) ?? null);
      } catch {
        if (!cancelled) setCallRequest(null);
      }
    }

    let timer: number | null = null;
    const startTimer = window.setTimeout(() => {
      void loadCallRequest();
      timer = window.setInterval(loadCallRequest, 60000);
    }, deferMs);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (timer) window.clearInterval(timer);
    };
  }, [classId, deviceId]);

  const membersDisplayedRef = useRef(false);

  useEffect(() => {
    if (!deviceId) return;

    setMembers((prev) => {
      if (prev.length > 0) return prev;

      return [
        {
          device_id: deviceId,
          display_name: "参加者",
          photo_path: null,
        },
      ];
    });
  }, [deviceId]);

  const applyLocalLeftCallOverride = useCallback(
    (member: Member): Member => {
      const did = String(member.device_id ?? "").trim();
      if (!did) return member;

      const locallyLeft =
        localExitedPeersRef.current.has(did) ||
        hasLocalLeftCall(sessionId, did);

      if (!locallyLeft) return member;

      return {
        ...member,
        is_in_call: false,
        screen: "room",
      };
    },
    [sessionId]
  );

  /** Leave the call and return to Room — keeps session_members; updates presence only. */
  const markSelfLeftCall = useCallback(() => {
    const did = String(deviceId ?? "").trim();
    if (!did || !sessionId) return;

    logNavigationIntent("left_call_return_room", "CallClient.markSelfLeftCall");
    markLocalLeftCall(sessionId, did, LOCAL_LEFT_CALL_EXPLICIT_REASON);
    localExitedPeersRef.current.add(did);
    setPeerStates({});
    setPeerDiagnostics({});
    prevCallStatusRef.current = {};
    prevCallStatusPeerLogRef.current = {};
    everConnectedPeersRef.current.clear();

    setMembers((prev) =>
      prev.map((member) =>
        String(member.device_id ?? "").trim() === did
          ? { ...member, is_in_call: false, screen: "room" }
          : member
      )
    );

    if (classId) {
      void fetch("/api/class/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          deviceId: did,
          screen: "room",
          sessionId,
        }),
        cache: "no-store",
      }).catch((e) => {
        console.warn("[call] optimistic room presence failed", e);
      });
    }
  }, [classId, deviceId, sessionId]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const fetchMembers = useCallback(
    async (reason = "manual", opts?: { fast?: boolean }) => {
      if (!sessionId || !classId) return;
      if (fetchingRef.current) {
        pendingFetchReasonRef.current = reason;
        console.log(
          `[call-perf] fetchMembers skip=in_flight reason=${reason}`
        );
        return;
      }

      fetchingRef.current = true;
      const useFast = true;

      try {
        const qs = new URLSearchParams({
          sessionId,
          classId,
          lite: "1",
          fast: "1",
        });
        if (deviceId) {
          qs.set("viewerDeviceId", deviceId);
        }

        const res = await fetchWithRetry(
          `/api/session/status?${qs.toString()}`,
          { cache: "no-store" },
          { kind: "members", maxAttempts: 3, signalType: reason }
        );

        const rawText = await res.text().catch(() => "");
        let json: SessionStatusResponse | null = null;

        try {
          json = rawText ? (JSON.parse(rawText) as SessionStatusResponse) : null;
        } catch {
          json = null;
        }

        if (!res.ok) {
          console.error("[call] session status fetch http error", {
            reason,
            status: res.status,
            statusText: res.statusText,
            rawText,
          });
          throw new Error(`HTTP ${res.status}`);
        }

        if (!json) {
          console.warn("[call] session status non-json or empty response", {
            reason,
            rawText,
          });
          throw new Error("non_json_or_empty_response");
        }

        if (!json.ok) {
          console.warn("[call] session status api not ok", {
            reason,
            error: json.error || "session_status_failed",
            rawText,
          });
          throw new Error(json.error || "session_status_failed");
        }

        const incoming = Array.isArray(json.members) ? json.members : [];
        logMemberDisplayNamesFromApi("call:session/status", incoming);
        const nextMembers: Member[] = [];

        for (const m of incoming) {
          const did = String(m.device_id ?? "").trim();
          if (!did) continue;

          nextMembers.push(
            applyLocalLeftCallOverride({
              device_id: did,
              display_name: formatMemberDisplayName(m),
              photo_path: String(m.photo_path ?? "").trim() || null,
              avatar_url: String(m.avatar_url ?? "").trim() || null,
              is_in_call: m.is_in_call === true,
              screen: String(m.screen ?? "").trim() || null,
            })
          );
        }

        if (
          shouldStartCallMemberInCallHysteresis(
            firstFastMembersAtRef.current,
            useFast,
            nextMembers.length
          )
        ) {
          firstFastMembersAtRef.current = Date.now();
        }

        debugConsoleLog(
          `[session-members] api-result context=call count=${nextMembers.length} ` +
            `ids=${compactMemberDeviceIds(nextMembers)} reason=${reason} ` +
            `session=${String(sessionId).slice(-6)} fast=${useFast}`
        );

        let redirectRemoved = false;
        let membersChanged = false;

        setMembers((prev) => {
          const hysteresisMembers = applyCallMemberInCallHysteresis(prev, nextMembers, {
            sessionId,
            viewerDeviceId: deviceId,
            firstFastMembersAt: firstFastMembersAtRef.current,
            localExitedPeers: localExitedPeersRef.current,
            memberLastInCallAt: memberLastInCallAtRef.current,
            fetchReason: reason,
          });

          const { merged: mergedMembers } = mergeSessionMembersPreservingRemoved(
            prev,
            hysteresisMembers,
            {
              sessionId,
              context: "call",
              explicitLeftIds: localExitedPeersRef.current,
              memberLastInListAt: memberLastInCallAtRef.current,
            }
          );

          const decision = evaluateMemberListApply({
            fetchOk: true,
            reason,
            prevMembers: prev,
            nextMembers: mergedMembers,
            viewerDeviceId: deviceId,
            emptyStreak: memberEmptyStreakRef.current,
            memberDropStreak: memberDropStreakRef.current,
            explicitLeftDeviceIds: localExitedPeersRef.current,
            viewerInSessionMembers: json.viewerState?.inSessionMembers,
          });

          memberEmptyStreakRef.current = decision.nextEmptyStreak;
          memberDropStreakRef.current = decision.nextMemberDropStreak;

          const { removed, added } = diffMemberDeviceIds(prev, mergedMembers);
          const freshMs = getPresenceFreshMsForContext("call");
          const presenceCounts = countPresenceStates(mergedMembers, freshMs);

          logRoomMembersBeforeUpdate({
            context: "call",
            reason,
            sessionId: String(sessionId),
            classId: String(classId),
            currentCount: prev.length,
            nextCount: mergedMembers.length,
            currentIds: compactMemberDeviceIds(prev),
            nextIds: compactMemberDeviceIds(mergedMembers),
            apply: decision.apply,
            ignoreReason: decision.ignoreReason,
            removed,
            added,
          });

          if (!decision.apply) {
            if (
              decision.ignoreReason === "temporary_empty_response" ||
              decision.ignoreReason === "partial_member_drop_retry"
            ) {
              if (decision.ignoreReason === "temporary_empty_response") {
                logRoomMembersEmptyIgnored({
                  context: "call",
                  reason,
                  emptyStreak: decision.nextEmptyStreak,
                  required: MEMBER_LIST_EMPTY_STREAK_REQUIRED,
                });
              }
              const preserved =
                mergedMembers.length > nextMembers.length ? mergedMembers : prev;
              const nextDisplay =
                preserved.length >= prev.length ? preserved : prev;
              logMemberSource({
                context: "call",
                sessionId,
                sessionMembers: nextMembers.length,
                presenceActive: presenceCounts.presenceActive,
                presenceStale: presenceCounts.presenceStale,
                displayMembers: nextDisplay.length,
                displayMemberIds: nextDisplay.map((m) => m.device_id),
                extra: `ignore=${decision.ignoreReason ?? "-"}`,
              });
              if (areMembersListEquivalent(prev, nextDisplay)) return prev;
              membersChanged = true;
              return nextDisplay;
            }
            return prev;
          }

          if (decision.shouldRedirectRemoved) {
            redirectRemoved = true;
            logRoomMembersRemoved({
              context: "call",
              deviceTail: String(deviceId).slice(-4),
              reason: "session_status_viewer_missing",
            });
            return prev;
          }

          const nextDisplay = mergedMembers.map((m) => {
            const existing = prev.find((x) => x.device_id === m.device_id);
            return {
              ...m,
              lastSpokeAt: existing?.lastSpokeAt,
            };
          });

          logMemberSource({
            context: "call",
            sessionId,
            sessionMembers: nextMembers.length,
            presenceActive: presenceCounts.presenceActive,
            presenceStale: presenceCounts.presenceStale,
            displayMembers: nextDisplay.length,
            displayMemberIds: nextDisplay.map((m) => m.device_id),
          });

          if (areMembersListEquivalent(prev, nextDisplay)) {
            console.log(
              `[call-perf] fetchMembers apply skipped=same_members reason=${reason}`
            );
            return prev;
          }
          membersChanged = true;
          return nextDisplay;
        });

        if (redirectRemoved) {
          logNavigationIntent("removed_from_session", "CallClient.fetchMembers");
          logRouteChange(getCurrentPath(), "/", "removed_from_session");
          releaseSessionMic("removed_from_session", sessionId);
          router.replace(withDev("/"));
          return;
        }

        debugConsoleLog("[call] fetchMembers success", {
          reason,
          sessionId,
          deviceId: String(deviceId).slice(-4),
          memberDeviceIds: compactMemberDeviceIds(nextMembers),
          membersSyncRevision: membersSyncRevisionRef.current + 1,
          count: nextMembers.length,
        });

        setFetchErrorCount(0);
        clearRetryTimer();
        membersSyncRevisionRef.current += 1;
        setMembersSyncRevision(membersSyncRevisionRef.current);
        markVoicePerf("members_loaded", {
          extra: `count=${nextMembers.length} reason=${reason} fast=${useFast}`,
        });
        if (nextMembers.length > 0 && !membersDisplayedRef.current) {
          membersDisplayedRef.current = true;
          markVoicePerf("members_displayed", {
            extra: `count=${nextMembers.length} fast=${useFast}`,
          });
          logVoicePerfPipeline(`reason=${reason}`);
        }

        if (Number.isFinite(Number(json.session?.capacity))) {
          setCapacity(Number(json.session?.capacity));
        }
      } catch (e: unknown) {
        const message =
          e && typeof e === "object" && "message" in e
            ? String((e as { message?: string }).message)
            : "unknown_error";

        if (!isIntentionalAbortError(e)) {
          debugVoiceRetryable(`fetchMembers:${reason}`, "members_fetch_error", {
            reason,
            message,
          });
        }

        setFetchErrorCount((prev) => prev + 1);
        clearRetryTimer();

        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          void fetchMembers("retry");
        }, 1200);
      } finally {
        fetchingRef.current = false;
        const pending = pendingFetchReasonRef.current;
        pendingFetchReasonRef.current = null;
        if (pending) {
          console.log(
            `[call-perf] fetchMembers coalescedRun reason=${pending}`
          );
          void fetchMembers(pending);
        }
      }
    },
    [sessionId, classId, deviceId, router, clearRetryTimer, applyLocalLeftCallOverride]
  );

  useEffect(() => {
    membersDisplayedRef.current = false;
    firstFastMembersAtRef.current = null;
    memberLastInCallAtRef.current = new Map();
    callMountAtRef.current = Date.now();
    renderCountRef.current = 0;
    lastFetchAtRef.current = null;

    void fetchMembers("initial", { fast: true });

    return () => {
      clearRetryTimer();
    };
  }, [fetchMembers, clearRetryTimer, sessionId]);

  useEffect(() => {
    if (!sessionId || !deviceId) return;

    const cleanupDiagnostics = installCallPageDiagnostics({
      sessionId,
      deviceId,
      onBfcacheRestore: ({ sessionId: restoredSessionId, deviceId: restoredDeviceId }) => {
        if (restoredSessionId !== sessionId || restoredDeviceId !== deviceId) return;
        clearLocalLeftCall(sessionId, deviceId);
        localExitedPeersRef.current.delete(deviceId);
        const resolved = resolveCallEntryUserMuted(sessionId, deviceId, {
          navigationContext: "bfcache",
        });
        const prevMuted = userMutedRef.current;
        userMutedRef.current = resolved.userMuted;
        muteInitReasonRef.current = resolved.reason;
        logRestoreMutedState({
          stored: resolved.stored,
          userMutedBefore: prevMuted,
          userMutedAfter: resolved.userMuted,
          trackEnabledBefore: localTrackEnabledRef.current,
          trackEnabledAfter: resolved.userMuted
            ? false
            : localTrackEnabledRef.current,
          reason:
            resolved.reason === "reload_restore"
              ? "reload_restore"
              : "bfcache_restore",
        });
        setUserMuted(resolved.userMuted);
        setMembersSyncRevision((revision) => revision + 1);
        void fetchMembers("bfcache_restore");
        requestRemoteAudioUnlock();
      },
    });

    return () => {
      cleanupDiagnostics();
    };
  }, [deviceId, fetchMembers, sessionId]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchMembers("visibility_resume");
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchMembers]);

  useEffect(() => {
    debugConsoleLog("[call] members state", {
      count: members.length,
      deviceId,
      members: members.map((m) => ({
        device_id: m.device_id,
        display_name: m.display_name,
        isMe: m.device_id === deviceId,
      })),
    });
  }, [members, deviceId]);

  useEffect(() => {
    if (!classId || !sessionId || !deviceId) return;

    async function sendPresence() {
      if (typeof document !== "undefined" && document.hidden) return;
      await fetch("/api/class/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          deviceId,
          screen: "call",
          sessionId,
        }),
        cache: "no-store",
      }).catch((e) => {
        debugVoiceRetryable("call:presence", "presence_heartbeat_failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      });
    }

    void sendPresence();

    window.setTimeout(() => {
      void sendPresence();
    }, 500);

    let timer: number | null = null;
    const schedulePresence = () => {
      if (timer) window.clearInterval(timer);
      timer = window.setInterval(() => {
        void sendPresence();
      }, getBackgroundSyncIntervalMs(10_000, 30_000));
    };
    schedulePresence();

    const onPresenceVisibility = () => {
      schedulePresence();
      if (document.visibilityState === "visible") {
        void sendPresence();
      }
    };
    document.addEventListener("visibilitychange", onPresenceVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onPresenceVisibility);
      if (timer) window.clearInterval(timer);
      if (classId && sessionId && deviceId) {
        void fetch("/api/class/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classId,
            deviceId,
            screen: "room",
            sessionId,
          }),
          cache: "no-store",
        }).catch(() => {});
      }
    };
  }, [classId, sessionId, deviceId]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`call-members-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_members",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          if (realtimeFetchDebounceRef.current) {
            window.clearTimeout(realtimeFetchDebounceRef.current);
          }
          realtimeFetchDebounceRef.current = window.setTimeout(() => {
            realtimeFetchDebounceRef.current = null;
            void fetchMembers("session_members_realtime");
          }, CALL_REALTIME_FETCH_DEBOUNCE_MS);
        }
      )
      .subscribe((status) => {
        debugConsoleLog("[call] members subscribe status", {
          sessionId,
          status,
        });
      });

    return () => {
      if (realtimeFetchDebounceRef.current) {
        window.clearTimeout(realtimeFetchDebounceRef.current);
        realtimeFetchDebounceRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [sessionId, fetchMembers]);

  useEffect(() => {
    if (!sessionId) return;
    if (members.length >= 2) return;

    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchMembers("poll_member_shortage");
    }, CALL_MEMBERS_POLL_MS);

    return () => window.clearInterval(timer);
  }, [sessionId, fetchMembers, members.length]);

  useEffect(() => {
    const memberIds = new Set(members.map((m) => m.device_id));

    setPeerStates((prev) => {
      const next: Record<string, PeerState> = {};
      for (const [id, state] of Object.entries(prev)) {
        if (memberIds.has(id)) next[id] = state;
      }
      return next;
    });
  }, [members]);

  const handleRemoteCountChange = useCallback((_count: number) => {}, []);

  const handleVoiceCleanup = useCallback(() => {
    debugConsoleLog(
      `[call] voice-cleanup reason=peer_layer_cleanup vis=${typeof document !== "undefined" ? document.visibilityState : "-"}`
    );
    setPeerStates({});
    setPeerDiagnostics({});
    setRemoteAudioHealth({});
    prevCallStatusRef.current = {};
    prevCallStatusPeerLogRef.current = {};
  }, []);

  const handleManualPeerHardResetReady = useCallback(
    (reset: (remoteId: string) => void | Promise<void>) => {
      manualPeerHardResetRef.current = reset;
    },
    []
  );

  const handleLocalTrackMutedApplied = useCallback(
    ({
      userMuted: muted,
      trackEnabled,
      reason,
    }: {
      userMuted: boolean;
      trackEnabled: boolean;
      reason: string;
    }) => {
      localTrackEnabledRef.current = trackEnabled;
      logRestoreMutedState({
        stored: readCallMutePreference(sessionId, deviceId),
        userMutedBefore: userMutedRef.current,
        userMutedAfter: muted,
        trackEnabledBefore: localTrackEnabledRef.current,
        trackEnabledAfter: trackEnabled,
        reason: `track_apply_${reason}`,
      });
    },
    [sessionId, deviceId]
  );

  const lastMicLevelCommitRef = useRef({ level: 0, atMs: 0 });

  const handleMicLevelChange = useCallback(
    (level: number) => {
      const now = Date.now();
      const prev = lastMicLevelCommitRef.current;
      if (
        Math.abs(level - prev.level) < MIC_LEVEL_COMMIT_MIN_DELTA &&
        now - prev.atMs < MIC_LEVEL_COMMIT_MIN_INTERVAL_MS
      ) {
        return;
      }
      lastMicLevelCommitRef.current = { level, atMs: now };
      setMicLevel(level);

      if (!userMuted && level > 0.08) {
        setMembers((prev) =>
          prev.map((m) =>
            m.device_id === deviceId ? { ...m, lastSpokeAt: Date.now() } : m
          )
        );
      }
    },
    [deviceId, userMuted]
  );

  const handleRemoteSpeakingChange = useCallback((remoteId: string) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.device_id === remoteId ? { ...m, lastSpokeAt: Date.now() } : m
      )
    );
  }, []);

  const handleRemotePlaybackHealthChange = useCallback(
    (remoteId: string, health: RemotePlaybackHealth) => {
      const normalizedHealth =
        health.lastPlaySuccessAt != null &&
        health.playFailedAt != null &&
        health.lastPlaySuccessAt >= health.playFailedAt
          ? { ...health, playFailedAt: null }
          : health;

      setRemoteAudioHealth((prev) => {
        const current = prev[remoteId];
        if (
          current?.verified === normalizedHealth.verified &&
          current?.playbackActive === normalizedHealth.playbackActive &&
          current?.playbackActiveMode === normalizedHealth.playbackActiveMode &&
          current?.audioActuallyPlaying === normalizedHealth.audioActuallyPlaying &&
          current?.trackReady === normalizedHealth.trackReady &&
          current?.playSuccess === normalizedHealth.playSuccess &&
          current?.lastPlaySuccessAt === normalizedHealth.lastPlaySuccessAt &&
          current?.playFailedAt === normalizedHealth.playFailedAt &&
          current?.lastAttachAt === normalizedHealth.lastAttachAt &&
          current?.level === normalizedHealth.level &&
          current?.currentTimeAdvanced === normalizedHealth.currentTimeAdvanced
        ) {
          return prev;
        }
        return {
          ...prev,
          [remoteId]: normalizedHealth,
        };
      });
    },
    []
  );

  const handleManualAudioReconnect = useCallback((remoteId: string) => {
    setRemoteAudioHealth((prev) => {
      if (!prev[remoteId]) return prev;
      const next = { ...prev };
      delete next[remoteId];
      return next;
    });
    void manualPeerHardResetRef.current(remoteId);
  }, []);

  const filled = members.length;

  const muteButtonLabel = useMemo(() => {
    if (!micReady) return "マイク準備中…";
    return userMuted ? "ミュート解除" : "ミュート";
  }, [micReady, userMuted]);

  const getMemberStatus = useCallback(
    (member?: Member) => {
      if (!member) {
        return {
          text: "待機中",
          color: "#9ca3af",
          chipBg: "#f3f4f6",
          chipText: "#6b7280",
        };
      }

      const memberId = String(member.device_id ?? "").trim();
      const viewerId = String(deviceId ?? "").trim();
      const isMe = memberId === viewerId && !!viewerId;
      const selfExplicitlyLeft =
        isMe && localExitedPeersRef.current.has(viewerId);
      const localExitedCall = isMe
        ? selfExplicitlyLeft
        : localExitedPeersRef.current.has(memberId) ||
          hasLocalLeftCall(sessionId, memberId);
      const isInCall = isMe
        ? !selfExplicitlyLeft
        : member.is_in_call === true && !localExitedCall;

      if (!micReady) {
        if (isMe) {
          const micStatus = {
            text: callInfo || "マイク準備中",
            color: "#92400e",
            chipBg: "#fffbeb",
            chipText: "#b45309",
            reason: callInfo ? "mic_permission_required" : "mic_not_ready",
            source: "localMic",
          };
          const prevText = prevCallStatusRef.current[memberId];
          if (prevText !== micStatus.text) {
            logParticipationStatusDecision({
              context: "call",
              deviceId: memberId,
              label: micStatus.text,
              status: "waiting",
              used: micStatus.source,
              reason: micStatus.reason,
              sources: {
                is_in_call: member.is_in_call ?? null,
                screen: member.screen ?? "room",
                peerState: peerStates[memberId] ?? "idle",
                micReady: false,
                isMe: true,
              },
            });
            prevCallStatusRef.current[memberId] = micStatus.text;
          }
          return micStatus;
        }

        const waitingForMic = {
          text: "接続待ち",
          color: "#6b7280",
          chipBg: "#f3f4f6",
          chipText: "#6b7280",
          reason: "local_mic_not_ready",
          source: "localMic",
        };
        const prevText = prevCallStatusRef.current[memberId];
        if (prevText !== waitingForMic.text) {
          logParticipationStatusDecision({
            context: "call",
            deviceId: memberId,
            label: waitingForMic.text,
            status: isInCall ? "in_call" : "waiting",
            used: waitingForMic.source,
            reason: waitingForMic.reason,
            sources: {
              is_in_call: member.is_in_call ?? null,
              screen: member.screen ?? null,
              peerState: peerStates[memberId] ?? "idle",
              micReady: false,
              isMe: false,
            },
          });
          prevCallStatusRef.current[memberId] = waitingForMic.text;
        }
        return waitingForMic;
      }

      if (isMe && selfExplicitlyLeft) {
        const waiting = {
          text: "待機中",
          color: "#6b7280",
          chipBg: "#f3f4f6",
          chipText: "#6b7280",
          reason: "explicit_leave",
          source: "participation",
        };
        const prevText = prevCallStatusRef.current[memberId];
        if (prevText !== waiting.text) {
          logParticipationStatusDecision({
            context: "call",
            deviceId: memberId,
            label: waiting.text,
            status: "waiting",
            used: waiting.source,
            reason: waiting.reason,
            sources: {
              is_in_call: member.is_in_call ?? null,
              screen: member.screen ?? "room",
              peerState: peerStates[memberId] ?? "idle",
              localExitedCall: true,
              isMe: true,
            },
          });
          prevCallStatusRef.current[memberId] = waiting.text;
        }
        return waiting;
      }

      if (isMe) {
        const selfStatus = {
          text: userMuted ? "自分 / ミュート中" : "自分 / 発話可能",
          color: "#6b7280",
          chipBg: userMuted ? "#fef2f2" : "#eff6ff",
          chipText: userMuted ? "#991b1b" : "#1d4ed8",
          reason: "self_on_call_screen",
          source: "isMe",
        };
        const prevText = prevCallStatusRef.current[memberId];
        if (prevText !== selfStatus.text) {
          logParticipationStatusDecision({
            context: "call",
            deviceId: memberId,
            label: selfStatus.text,
            status: "in_call",
            used: selfStatus.source,
            reason: selfStatus.reason,
            sources: {
              is_in_call: member.is_in_call ?? null,
              screen: "call",
              peerState: peerStates[memberId] ?? "idle",
              micReady: true,
              isMe: true,
            },
          });
          prevCallStatusRef.current[memberId] = selfStatus.text;
        }
        return selfStatus;
      }

      const peerState = peerStates[memberId] ?? "idle";
      const diag = peerDiagnostics[memberId];
      const audioHealth = remoteAudioHealth[memberId];
      const effective = resolveEffectivePeerConnection({
        peerState,
        remoteTracksCount: diag?.remoteTracksCount ?? 0,
        hasRemoteStream: diag?.hasRemoteStream ?? false,
        trackReady: diag?.trackReady ?? "-",
        lastPlaybackActiveAt: diag?.lastPlaybackActiveAt ?? null,
        lastPlaybackConfirmedAt: diag?.lastPlaybackConfirmedAt ?? null,
        playbackActive:
          audioHealth?.playbackActive === true ||
          audioHealth?.audioActuallyPlaying === true,
        playbackActiveMode: audioHealth?.playbackActiveMode,
        transportUnconfirmed: diag?.transportUnconfirmed === true,
        nowMs,
      });
      const wasPeerConnected = everConnectedPeersRef.current.has(memberId);
      const remoteAudioVerified =
        effective.effectiveConnected && diag?.transportUnconfirmed !== true
          ? audioHealth?.verified === true ||
            audioHealth?.audioActuallyPlaying === true ||
            isRecentPlaySuccess(audioHealth?.lastPlaySuccessAt, nowMs) ||
            isRemoteAudioHealthyNow({
              health: audioHealth ?? null,
              trackReady: audioHealth?.trackReady ?? diag?.trackReady ?? "-",
              hasRemoteStream: diag?.hasRemoteStream ?? false,
              nowMs,
            })
            ? true
            : audioHealth
              ? false
              : effective.activePlaybackConnected
                ? true
                : null
          : null;

      const audioUnhealthySinceMs = computeAudioUnhealthySinceMs({
        nowMs,
        remoteAudioHealth: audioHealth ?? null,
        hasRemoteStream: diag?.hasRemoteStream ?? false,
        trackReady: audioHealth?.trackReady ?? diag?.trackReady ?? "-",
        wasPeerConnected,
      });

      const manualReconnect = resolveDisplayManualAudioReconnect({
        isMe: false,
        hasRemoteStream: diag?.hasRemoteStream ?? false,
        trackReady: audioHealth?.trackReady ?? diag?.trackReady ?? "-",
        conn: diag?.conn ?? "-",
        ice: diag?.ice ?? "-",
        hasPc: diag?.hasPc ?? false,
        remoteAudioHealth: audioHealth ?? null,
        lastOnTrackAt: diag?.lastOnTrackAt ?? null,
        lastUnmuteAt: diag?.lastUnmuteAt ?? null,
        lastPlaySuccessAt:
          audioHealth?.lastPlaySuccessAt ?? diag?.lastPlaySuccessAt ?? null,
        lastPlaybackConfirmedAt: diag?.lastPlaybackConfirmedAt ?? null,
        lastPlaybackActiveAt: diag?.lastPlaybackActiveAt ?? null,
        liveStreamHealHold: diag?.liveStreamHealHold === true,
        p2pDirectFailedHoldActive: diag?.p2pDirectFailedHoldActive === true,
        autoHardResetInProgress: diag?.autoHardResetInProgress === true,
        autoHardResetGiveUp: diag?.autoHardResetGiveUp === true,
        reconnectRequestPending: diag?.reconnectRequestPending === true,
        wasPeerConnected,
        nowMs,
        debugUi: isVoiceLayerDebugEnabled(),
        audioUnhealthySinceMs,
      });

      const rawStatus = resolveCallMemberStatus({
        isMe,
        isMuted: userMuted,
        isInCall,
        inSessionMember: true,
        viewerOnCallScreen: isMe ? true : true,
        screen: isMe ? "call" : localExitedCall ? "room" : member.screen,
        localExitedCall,
        peerState,
        effectivePeerState: effective.effectivePeerState,
        activePlaybackConnected: effective.activePlaybackConnected,
        playbackActiveMode: audioHealth?.playbackActiveMode,
        hasPc: diag?.hasPc ?? false,
        orphanRemoteAudio: diag?.orphanRemoteAudio === true,
        p2pDirectFailedHoldActive: diag?.p2pDirectFailedHoldActive === true,
        transportUnconfirmed: diag?.transportUnconfirmed === true,
        p2pRetryActive: diag?.p2pRetryActive === true,
        p2pRetryExhausted: diag?.p2pRetryExhausted === true,
        lastPlaybackConfirmedAt: diag?.lastPlaybackConfirmedAt ?? null,
        lastPlaybackActiveAt: diag?.lastPlaybackActiveAt ?? null,
        liveStreamHealHold: diag?.liveStreamHealHold === true,
        autoHardResetInProgress: diag?.autoHardResetInProgress === true,
        autoHardResetGiveUp: diag?.autoHardResetGiveUp === true,
        wasPeerConnected,
        remoteAudioVerified,
        remoteAudioHealth: audioHealth ?? null,
        hasRemoteStream: diag?.hasRemoteStream ?? false,
        trackReady: audioHealth?.trackReady ?? diag?.trackReady ?? "-",
        conn: diag?.conn ?? "-",
        ice: diag?.ice ?? "-",
        lastOnTrackAt: diag?.lastOnTrackAt ?? null,
        lastUnmuteAt: diag?.lastUnmuteAt ?? null,
        lastPlaySuccessAt:
          audioHealth?.lastPlaySuccessAt ?? diag?.lastPlaySuccessAt ?? null,
        showReconnectButton: manualReconnect.show,
        nowMs,
      });

      const { status, state: labelState } = applyCallMemberStatusHysteresis({
        remoteDeviceId: memberId,
        candidate: rawStatus,
        previous: peerLabelHysteresisRef.current[memberId] ?? null,
        nowMs,
        isMe,
        recentPlaySuccess: isRecentPlaySuccess(
          audioHealth?.lastPlaySuccessAt ?? diag?.lastPlaySuccessAt,
          nowMs
        ),
        audioActuallyPlaying: audioHealth?.audioActuallyPlaying === true,
        playbackActive: audioHealth?.playbackActive === true,
      });
      peerLabelHysteresisRef.current[memberId] = labelState;

      if (!isMe && diag) {
        setRemoteAudioPipelinePeerContext(memberId, {
          hasPc: diag.hasPc ?? false,
          conn: diag.conn ?? "-",
          ice: diag.ice ?? "-",
        });
      }

      if (status.text === "音声が不安定です" && !isMe) {
        const lastOnTrackAgeMs =
          diag?.lastOnTrackAt != null && nowMs > 0
            ? nowMs - diag.lastOnTrackAt
            : "-";
        const lastAudioConfirmAgeMs =
          diag?.lastPlaybackConfirmedAt != null && nowMs > 0
            ? nowMs - diag.lastPlaybackConfirmedAt
            : "-";
        logVoiceUnstable({
          reason: mapVoiceUnstableReason(
            status.reason,
            diag?.hasPc ?? false,
            diag?.ice ?? "-",
            diag?.conn ?? "-"
          ),
          remoteId: memberId,
          pc: diag?.hasPc ?? false,
          ice: diag?.ice ?? "-",
          connection: diag?.conn ?? "-",
          signaling: diag?.sig ?? "-",
          remoteTrack: diag?.hasRemoteStream ?? false,
          audioConfirmed:
            audioHealth?.verified === true ||
            audioHealth?.audioActuallyPlaying === true,
          audioConfirmedStrict: audioHealth?.audioConfirmedStrict === true,
          inboundBytesDelta: "-",
          outboundBytesDelta: "-",
          lastRemoteTrackAgeMs: lastOnTrackAgeMs,
          lastAudioConfirmAgeMs: lastAudioConfirmAgeMs,
        });
      }

      const prevText = prevCallStatusRef.current[member.device_id];
      if (prevText !== status.text) {
        logParticipationStatusDecision({
          context: "call",
          deviceId: memberId,
          label: status.text,
          status: isInCall ? "in_call" : "waiting",
          used: status.source,
          reason: status.reason,
          sources: {
            is_in_call: member.is_in_call ?? null,
            screen: member.screen ?? null,
            peerState,
            effectivePeerState: effective.effectivePeerState,
            activePlaybackConnected: effective.activePlaybackConnected,
            wasPeerConnected,
            remoteAudioVerified,
            localExitedCall,
            isMe,
          },
        });
        prevCallStatusRef.current[memberId] = status.text;
      }

      const hasRemoteMedia =
        (diag?.remoteTracksCount ?? 0) > 0 || diag?.hasRemoteStream === true;
      if (hasRemoteMedia && !diag?.remoteAudioMounted && !isMe) {
        if (!missingRemoteAudioWarnedRef.current.has(memberId)) {
          missingRemoteAudioWarnedRef.current.add(memberId);
          console.warn(
            `[call-audio] missing-remote-audio remote=${memberId.slice(-3)} reason=stream_exists_but_audio_component_missing`
          );
        }
      } else if (diag?.remoteAudioMounted) {
        missingRemoteAudioWarnedRef.current.delete(memberId);
      }

      const playbackActiveAgeMs =
        diag?.lastPlaybackActiveAt != null && nowMs > 0
          ? nowMs - diag.lastPlaybackActiveAt
          : null;
      const playSuccessAgeMs =
        audioHealth?.lastPlaySuccessAt != null && nowMs > 0
          ? nowMs - audioHealth.lastPlaySuccessAt
          : null;
      const playFailedAgeMs =
        audioHealth?.playFailedAt != null && nowMs > 0
          ? nowMs - audioHealth.playFailedAt
          : null;
      const remoteAudioHealthStr =
        audioHealth == null
          ? "pending"
          : audioHealth.verified
            ? "verified"
            : audioHealth.audioActuallyPlaying
              ? "playing"
              : audioHealth.playbackActive
                ? "playback_active"
                : "unverified";
      const peerLogSignature = [
        status.text,
        peerState,
        effective.effectivePeerState,
        status.statusSource ?? "-",
        remoteAudioHealthStr,
        audioHealth?.audioActuallyPlaying ?? false,
        playSuccessAgeMs ?? "-",
        playFailedAgeMs ?? "-",
        manualReconnect.show,
        manualReconnect.reason,
        diag?.hasPc ?? false,
        diag?.conn ?? "-",
        diag?.ice ?? "-",
        diag?.sig ?? "-",
        diag?.hasRemoteStream ?? false,
        diag?.remoteTracksCount ?? 0,
        audioHealth?.trackReady ?? diag?.trackReady ?? "-",
        diag?.isRemoteInCall ?? isInCall,
        status.reason,
        playbackActiveAgeMs ?? "-",
      ].join("|");

      if (prevCallStatusPeerLogRef.current[memberId] !== peerLogSignature) {
        logCallStatusPeer({
          localDeviceId: viewerId,
          remoteDeviceId: memberId,
          label: status.text,
          status: isInCall ? "in_call" : "waiting",
          peerState,
          effectivePeerState: effective.effectivePeerState,
          statusSource: status.statusSource,
          remoteAudioHealth: remoteAudioHealthStr,
          audioActuallyPlaying: audioHealth?.audioActuallyPlaying === true,
          playSuccessAgeMs,
          playFailedAgeMs,
          audioLevel: audioHealth?.level ?? null,
          showReconnectButton: manualReconnect.show,
          reconnectReason: manualReconnect.reason,
          playbackActiveAgeMs,
          hasPc: diag?.hasPc ?? false,
          conn: diag?.conn ?? "-",
          ice: diag?.ice ?? "-",
          sig: diag?.sig ?? "-",
          hasRemoteStream: diag?.hasRemoteStream ?? false,
          remoteTracksCount: diag?.remoteTracksCount ?? 0,
          trackReady: audioHealth?.trackReady ?? diag?.trackReady ?? "-",
          isRemoteInCall: diag?.isRemoteInCall ?? isInCall,
          reason: status.reason,
        });
        prevCallStatusPeerLogRef.current[memberId] = peerLogSignature;
      }

      return status;
    },
    [callInfo, deviceId, userMuted, nowMs, peerDiagnostics, peerStates, remoteAudioHealth, sessionId]
  );

  useEffect(() => {
    if (!sessionId || !deviceId) return;
    debugConsoleLog(
      `[call-status] self-muted-debug userMuted=${userMuted} trackEnabled=${localTrackEnabledRef.current ?? "-"} ` +
        `micReady=${micReady} label=${userMuted ? "自分 / ミュート中" : "自分 / 発話可能"} reason=${muteInitReasonRef.current}`
    );
  }, [deviceId, micReady, sessionId, userMuted]);

  useEffect(() => {
    if (!micReady) return;
    requestRemoteAudioUnlock();
  }, [micReady]);

  const hasOtherMember = members.some((m) => m.device_id !== deviceId);

  const speakingMemberId = useMemo(() => {
    const SPEAKING_MS = 1500;

    const speaking = members.find(
      (m) =>
        !!m.lastSpokeAt && nowMs > 0 && nowMs - m.lastSpokeAt < SPEAKING_MS
    );

    return speaking?.device_id ?? null;
  }, [members, nowMs]);

  useEffect(() => {
    if (speakingMemberId) {
      lastSpeakerIdRef.current = speakingMemberId;
    }
  }, [speakingMemberId]);

  const sortedMembers = useMemo(() => {
    const lastSpeakerId = lastSpeakerIdRef.current;

    return [...members].sort((a, b) => {
      const aIsLastSpeaker = a.device_id === lastSpeakerId;
      const bIsLastSpeaker = b.device_id === lastSpeakerId;

      if (aIsLastSpeaker !== bIsLastSpeaker) {
        return aIsLastSpeaker ? -1 : 1;
      }

      const aState = peerStates[a.device_id] ?? "idle";
      const bState = peerStates[b.device_id] ?? "idle";

      const priority: Record<PeerState, number> = {
        connected: 0,
        idle: 1,
        connecting: 2,
        failed: 3,
      };

      const aP = priority[aState] ?? 99;
      const bP = priority[bState] ?? 99;

      if (aP !== bP) return aP - bP;

      return 0;
    });
  }, [members, speakingMemberId, peerStates]);

  const handleMicReadyChange = useCallback((ready: boolean) => {
    setMicReady(ready);
    if (ready) {
      markVoicePerf("local_mic_ready");
    }
  }, []);

  const handlePeerStatesChange = useCallback((states: Record<string, PeerState>) => {
    setPeerStates((prev) => (arePeerStatesEqual(prev, states) ? prev : states));
  }, []);

  const handlePeerDiagnosticsChange = useCallback(
    (diagnostics: Record<string, PeerStatusDiagnostics>) => {
      setPeerDiagnostics((prev) =>
        arePeerDiagnosticsEqual(prev, diagnostics) ? prev : diagnostics
      );
    },
    []
  );

  const handleVoiceReadinessSnapshot = useCallback(
    (snapshot: {
      remoteIds: string[];
      settingsReady: boolean;
      signalReady: boolean;
      turnReady: boolean;
      voiceEnabled: boolean;
    }) => {
      voiceReadinessRef.current = snapshot;
    },
    []
  );

  const remoteMemberIdsRef = useRef<string[]>([]);
  const remoteMemberIds = useMemo(() => {
    const next = computeRemoteMemberIds(members, deviceId);
    const prev = remoteMemberIdsRef.current;
    if (
      prev.length === next.length &&
      prev.every((id, index) => id === next[index])
    ) {
      return prev;
    }
    remoteMemberIdsRef.current = next;
    return next;
  }, [members, deviceId]);

  useLayoutEffect(() => {
    renderCountRef.current += 1;
  });

  const lastCallRenderPerfLogRef = useRef({ count: 0, atMs: 0 });

  useEffect(() => {
    const timer = window.setInterval(() => {
      const count = renderCountRef.current;
      const prev = lastCallRenderPerfLogRef.current;
      const delta = count - prev.count;
      const sincePrevMs = Date.now() - prev.atMs;
      if (delta < 8 && sincePrevMs < 20_000) return;

      lastCallRenderPerfLogRef.current = { count, atMs: Date.now() };
      const sinceMountMs = Date.now() - callMountAtRef.current;
      const lastFetchAgeMs =
        lastFetchAtRef.current != null
          ? Date.now() - lastFetchAtRef.current
          : -1;
      const rendersPerSec =
        sincePrevMs > 0 ? Math.round((delta / sincePrevMs) * 1000) : 0;
      console.log(
        `[call-render-perf] count=${count} delta=${delta} sinceMountMs=${sinceMountMs} ` +
          `rendersPerSec=${rendersPerSec} displayMembers=${members.length} ` +
          `remoteMembers=${remoteMemberIds.length} fetchInFlight=${fetchingRef.current ? 1 : 0} ` +
          `lastFetchAgeMs=${lastFetchAgeMs} note=micLevel_raf_throttled`
      );
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [members.length, remoteMemberIds.length, sessionId]);

  const voiceLayerBlockingReason = useMemo(
    () =>
      resolveVoiceLayerBlockingReason({
        sessionId,
        deviceId,
        membersCount: members.length,
      }),
    [deviceId, members.length, sessionId]
  );

  const voiceLayerShouldRender = voiceLayerBlockingReason === "-";

  const buildCallReadinessSnapshot = useCallback((): CallReadinessSnapshot => {
    const voice = voiceReadinessRef.current;
    return {
      sessionId,
      classId,
      deviceId,
      members: members.length,
      remoteIds: Math.max(voice.remoteIds.length, remoteMemberIds.length),
      micReady,
      signalReady: voice.signalReady,
      settingsReady: voice.settingsReady,
      turnReady: voice.turnReady,
      voiceEnabled: voice.voiceEnabled,
      callLayerMounted: voiceLayerMountedRef.current,
    };
  }, [classId, deviceId, members.length, micReady, remoteMemberIds.length, sessionId]);

  const peerStatesForReadinessRef = useRef(peerStates);
  peerStatesForReadinessRef.current = peerStates;

  const runCallReadinessRecheck = useCallback(
    (reason: string) => {
      const snap = buildCallReadinessSnapshot();
      logCallReadyCheck(snap, reason);
      const stuckReason = resolveCallReadyStuckReason(snap);
      const peersConnected = Object.values(peerStatesForReadinessRef.current).some(
        (state) => state === "connected"
      );
      if (!stuckReason || peersConnected) {
        callReadySinceRef.current = null;
        callReadyStuckLoggedRef.current = false;
        setShowCallStuckReconnect(false);
        return;
      }
      if (callReadySinceRef.current == null) {
        callReadySinceRef.current = Date.now();
        return;
      }
      const stuckMs = Date.now() - callReadySinceRef.current;
      if (stuckMs < CALL_READY_STUCK_MS) return;
      if (!callReadyStuckLoggedRef.current) {
        callReadyStuckLoggedRef.current = true;
        logCallReadyStuck(stuckReason, snap, stuckMs);
      }
      setShowCallStuckReconnect(true);
    },
    [buildCallReadinessSnapshot]
  );

  const runCallReadinessRecheckRef = useRef(runCallReadinessRecheck);
  runCallReadinessRecheckRef.current = runCallReadinessRecheck;

  const handleVoiceLayerMountedChange = useCallback((mounted: boolean) => {
    voiceLayerMountedRef.current = mounted;
    runCallReadinessRecheckRef.current(
      mounted ? "voice_layer_mounted" : "voice_layer_unmounted"
    );
  }, []);

  useEffect(() => {
    callReadySinceRef.current = null;
    callReadyStuckLoggedRef.current = false;
    setShowCallStuckReconnect(false);
  }, [sessionId, classId, deviceId]);

  useEffect(() => {
    runCallReadinessRecheckRef.current("initial");
  }, [sessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      runCallReadinessRecheckRef.current("interval");
    }, 3000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  const handleCallStuckReconnect = useCallback(() => {
    const snap = buildCallReadinessSnapshot();
    logCallReadyCheck(snap, "manual_reconnect");
    callReadySinceRef.current = Date.now();
    callReadyStuckLoggedRef.current = false;
    setShowCallStuckReconnect(false);
    for (const member of members) {
      const remoteId = String(member.device_id ?? "").trim();
      if (!remoteId || remoteId === deviceId) continue;
      void manualPeerHardResetRef.current(remoteId);
    }
    void fetchMembers("readiness_reconnect", { fast: true });
  }, [buildCallReadinessSnapshot, deviceId, fetchMembers, members]);

  const voiceMembersRef = useRef<Member[]>([]);
  const voiceMembers = useMemo(() => {
    const next = buildVoiceConnectionMembers(members, {
      sessionId,
      explicitLeftIds: localExitedPeersRef.current,
      stable: isStableVoiceJoinMode(),
    });
    if (areMembersListEquivalent(voiceMembersRef.current, next)) {
      return voiceMembersRef.current;
    }
    voiceMembersRef.current = next;
    return next;
  }, [members, sessionId, membersSyncRevision]);

  useEffect(() => {
    const uiInCall = members.filter((m) => m.is_in_call === true).length;
    const voiceInCall = voiceMembers.filter((m) => m.is_in_call === true).length;
    voiceDebugLog("[call] voiceMembers before voice layer", {
      uiCount: members.length,
      voiceCount: voiceMembers.length,
      uiInCall,
      voiceInCall,
      deviceId,
      voiceMembers: voiceMembers.map((m) => ({
        device_id: m.device_id,
        display_name: m.display_name,
        is_in_call: m.is_in_call,
        isMe: m.device_id === deviceId,
      })),
    });
  }, [members, voiceMembers, deviceId]);

  useLayoutEffect(() => {
    const renderKey =
      `${sessionId.slice(-6)}|${classId.slice(-6)}|${deviceId.slice(-4)}|` +
      `${members.length}|${remoteMemberIds.length}|${micReady ? 1 : 0}|` +
      `${voiceLayerShouldRender ? 1 : 0}|${voiceLayerBlockingReason}`;
    const renderKeyChanged = lastCallRenderLogKeyRef.current !== renderKey;
    if (renderKeyChanged) {
      lastCallRenderLogKeyRef.current = renderKey;
      logCallRender({
        sessionId,
        classId,
        deviceId,
        displayMembers: members.length,
        remoteMembers: remoteMemberIds.length,
        localStreamReady: micReady,
        micReady,
        voiceLayerShouldRender,
        blockingReason: voiceLayerBlockingReason,
      });
      logCallMembersDebug({ deviceId, members });
      logVoiceLayerRenderCheck({
        shouldRender: voiceLayerShouldRender,
        blockingReason: voiceLayerBlockingReason,
        sessionId,
        deviceId,
        members: members.length,
        remoteMembers: remoteMemberIds.length,
        localStreamReady: micReady,
        micReady,
      });
      runCallReadinessRecheckRef.current("render");
    }
  }, [
    classId,
    deviceId,
    members,
    micReady,
    remoteMemberIds.length,
    sessionId,
    voiceLayerBlockingReason,
    voiceLayerShouldRender,
  ]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      {voiceLayerShouldRender ? (
        <CallVoiceLayer
          sessionId={sessionId}
          deviceId={deviceId}
          members={voiceMembers}
          membersSyncRevision={membersSyncRevision}
          userMuted={userMuted}
          userMutedRef={userMutedRef}
          onLocalTrackMutedApplied={handleLocalTrackMutedApplied}
          onMicReadyChange={handleMicReadyChange}
          onMicLevelChange={handleMicLevelChange}
          onRemoteSpeakingChange={handleRemoteSpeakingChange}
          onRemotePlaybackHealthChange={handleRemotePlaybackHealthChange}
          onRemoteCountChange={handleRemoteCountChange}
          onStatusChange={setCallInfo}
          onPeerStatesChange={handlePeerStatesChange}
          onPeerDiagnosticsChange={handlePeerDiagnosticsChange}
          onVoiceCleanup={handleVoiceCleanup}
          onManualPeerHardResetReady={handleManualPeerHardResetReady}
          onReadinessSnapshot={handleVoiceReadinessSnapshot}
          onVoiceLayerMountedChange={handleVoiceLayerMountedChange}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>
            通話ルーム
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
            参加人数 {filled}/{capacity}
          </div>
          {callInfo ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: "#b45309",
                fontWeight: 800,
              }}
            >
              {callInfo}
            </div>
          ) : null}
          {showCallStuckReconnect ? (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#92400e", fontWeight: 800 }}>
                接続処理が長時間続いています
              </span>
              <button
                type="button"
                onClick={() => handleCallStuckReconnect()}
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
          {meetingPlan && !meetingPlan.is_past ? (
            <div style={{ marginTop: 4, fontSize: 12, color: "#374151", fontWeight: 800 }}>
              次の集合：{meetingPlan.display_label}
            </div>
          ) : null}
          {callRequest?.is_active ? (
            <div style={{ marginTop: 4, fontSize: 12, color: "#92400e", fontWeight: 800 }}>
              {callRequest.display_label}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => router.push(profileEditHref)}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            プロフィール編集
          </button>

          <button
            onClick={async () => {
              if (!sessionId || !classId) {
                alert("まだ招待リンクを作れません。");
                return;
              }

              const inviteUrl =
                `${window.location.origin}/room?invite=1&autojoin=1` +
                `&classId=${encodeURIComponent(classId)}` +
                `&sessionId=${encodeURIComponent(sessionId)}`;

              try {
                await navigator.clipboard.writeText(inviteUrl);
                alert("招待リンクをコピーしました");
              } catch {
                window.prompt(
                  "コピーできませんでした。下のリンクをコピーしてください。",
                  inviteUrl
                );
              }
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            }}
          >
            友達を招待
          </button>

          <button
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#374151",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
            }}
            onClick={() => {
              const roomHref = withDev(
                `/room?autojoin=0&classId=${encodeURIComponent(classId)}` +
                  `&sessionId=${encodeURIComponent(sessionId)}`
              );
              logNavigationIntent("left_call_return_room", "CallClient.exit_button");
              logRouteChange(getCurrentPath(), roomHref, "left_call_return_room");
              markSelfLeftCall();
              releaseSessionMic("call_exit", sessionId);
              router.push(roomHref);
            }}
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

      {!hasOtherMember && (
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
          相手の参加を待っています。
        </div>
      )}

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
            const member = sortedMembers[i];
            const isFilled = !!member;
            const isMe = member?.device_id === deviceId;
            const status = getMemberStatus(member);
            const memberId = member?.device_id ?? "";
            const diag = memberId ? peerDiagnostics[memberId] : undefined;
            const memberAudioHealth = memberId
              ? remoteAudioHealth[memberId] ?? null
              : null;
            const showManualAudioReconnect =
              !!member &&
              !isMe &&
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
                autoHardResetGiveUp: diag?.autoHardResetGiveUp === true,
                reconnectRequestPending: diag?.reconnectRequestPending === true,
                wasPeerConnected: everConnectedPeersRef.current.has(memberId),
                nowMs,
                debugUi: isVoiceLayerDebugEnabled(),
                audioUnhealthySinceMs: computeAudioUnhealthySinceMs({
                  nowMs,
                  remoteAudioHealth: memberAudioHealth,
                  hasRemoteStream: diag?.hasRemoteStream ?? false,
                  trackReady:
                    memberAudioHealth?.trackReady ?? diag?.trackReady ?? "-",
                  wasPeerConnected: everConnectedPeersRef.current.has(memberId),
                }),
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
                    setProfileTarget({
                      deviceId: memberDeviceId,
                      viewerDeviceId: deviceId,
                      classId,
                      sessionId,
                      displayName: member.display_name,
                      photoPath: member.photo_path,
                    });
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
                      {isSpeaking ? "発話中" : status.text}
                    </div>

                    {showManualAudioReconnect && memberId ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleManualAudioReconnect(memberId);
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

                  {isFilled && !isMe && member?.device_id ? (
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
            disabled={!micReady}
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
            onClick={() => {
              requestRemoteAudioUnlock();
              setUserMuted((prev) => {
                const next = !prev;
                userMutedRef.current = next;
                logMuteStateSet({
                  userMuted: next,
                  prev,
                  reason: next ? "user_click_mute" : "user_click_unmute",
                  source: "user_click",
                });
                writeCallMutePreference(sessionId, deviceId, next, {
                  source: "user_click",
                });
                return next;
              });
            }}
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

      <section style={{ marginTop: 16 }}>
        {sessionId ? <SharedCanvasBoard sessionId={sessionId} /> : null}
      </section>

      <div style={{ marginTop: 16 }}>
        <SessionMessages
          sessionId={sessionId}
          deviceId={deviceId}
          displayName={formatMemberDisplayName(
            members.find((m) => m.device_id === deviceId) ?? {}
          )}
          title="メッセージ"
          maxHeight={240}
          collapsible
        />
      </div>

      <MemberProfileModal
        target={profileTarget}
        onClose={() => setProfileTarget(null)}
        returnTo={buildCurrentPathReturnTo(pathname, searchParams.toString())}
      />
    </main>
  );
}