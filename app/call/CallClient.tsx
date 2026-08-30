"use client";

import { debugConsoleLog, isDebugVoiceEnabled, voiceProdLog } from "@/lib/debugVoiceLog";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { logCallEntryBlocked } from "@/lib/entryFlowLog";
import { buildInviteRoomUrl } from "@/lib/appOrigin";
import { shareOrCopyInviteUrl } from "@/lib/inviteShare";
import { buildCallRecruitmentView } from "@/lib/callRecruitmentUi";
import SharedCanvasBoard from "./SharedCanvasBoard";
import CallRoomView from "./CallRoomView";
import CallVoiceLayer from "./CallVoiceLayer";
import {
  isCallMicSessionActive,
  releaseSessionMic,
  requestCallMicrophone,
  resetMicSessionForRejoin,
} from "./voice/useLocalMic";
import { MicEntryGate } from "@/components/MicEntryGate";
import { InAppBrowserNotice } from "@/components/InAppBrowserNotice";
import { detectInAppBrowser } from "@/lib/inAppBrowser";
import { queryMicrophonePermissionState } from "@/lib/micPermissionUi";
import { supabase } from "@/lib/supabaseClient";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";
import { resolveShellDashboardPath } from "@/lib/appShellContext";
import {
  buildCurrentPathReturnTo,
  buildProfileEditPath,
} from "@/lib/profileNavigation";
import SessionMessages from "@/components/SessionMessages";
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
import {
  areMembersListEquivalent,
  areVoiceConnectionMembersEquivalent,
} from "@/lib/memberListEquality";
import {
  CALL_READY_STUCK_MS,
  createCallReadinessWaitState,
  formatCallReadinessWaitMetrics,
  logCallReadyCheck,
  logCallReadyStuck,
  resetCallReadinessSessionLog,
  resolveCallReadyStuckReason,
  updateCallReadinessWaitState,
  VOICE_PLAYBACK_CONNECT_TARGET_MS,
  type CallReadinessSnapshot,
  type CallReadinessWaitState,
} from "@/lib/callReadiness";
import {
  computeRemoteMemberIds,
  logCallMembersDebug,
  logCallMembersLatency,
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
  markCallMicEverUnmuted,
  readCallMutePreference,
  resolveCallEntryUserMuted,
  restoreCallSessionAfterReload,
  writeCallMutePreference,
} from "@/lib/callLifecycle";
import { clearCallBfcacheSuspend } from "@/lib/callReloadDiagnostics";
import { requestRemoteAudioUnlock } from "@/lib/remoteAudioUnlock";
import {
  normalizeMemberDeviceId,
  type MemberProfileTarget,
} from "@/lib/memberProfileView";
import { debugVoiceRetryable } from "@/lib/debugVoiceLog";
import {
  getBackgroundSyncIntervalMs,
  logAppLife,
} from "@/lib/appLifecycle";
import {
  buildCallActivePresenceBody,
  isCallForegroundResumeEvent,
  shouldPostRoomPresenceOnCallEffectCleanup,
  shouldPublishCallPresence,
} from "@/lib/callPresenceForeground";
import { postClassPresence } from "@/lib/postClassPresence";
import { logSessionInCallFalseWrite } from "@/lib/sessionInCallWriteLog";
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
import { isStableVoiceJoinMode, shouldUseFastSessionStatus } from "@/lib/stableVoiceJoin";
import { buildVoiceConnectionMembers } from "@/lib/voiceSessionMembers";
import {
  clearCallLeaveStickyForDevice,
  logCallMemberVisibility,
  resolveCallMemberUiExcludeReason,
  resolveConfirmedLeftCallFlag,
  shouldClearStickyLeaveOnServerRejoin,
} from "@/lib/callMemberVisibilityLog";
import type { MeetingPlanPublic } from "@/lib/meetingPlanClient";
import type { CallRequestPublic } from "@/lib/callRequest";
import {
  logParticipationStatusDecision,
  isRecentPlaySuccess,
  isRemoteAudioHealthyNow,
  applyCallMemberStatusHysteresis,
  computeAudioUnhealthySinceMs,
  logCallStatusTransition,
  mapCallStatusLabelToPhase,
  resolveCallStatusTransitionLog,
  resolveCallMemberStatus,
  resolveDisplayManualAudioReconnect,
  resolveEffectivePeerConnection,
  type CallStatusPhase,
  type PeerLabelHysteresisState,
} from "@/lib/memberPresenceStatus";
import {
  logInitialSafetyMute,
  logMuteStateSet,
  logRestoreMutedState,
  logVoiceUiMuteToggle,
  logVoiceUiUserMutedState,
} from "@/lib/localMicMuteState";
import type { RemotePlaybackHealth } from "@/app/call/voice/RemoteAudio";
import {
  clearLocalLeftCall,
  hasLocalLeftCall,
  LOCAL_LEFT_CALL_EXPLICIT_REASON,
  markLocalLeftCall,
} from "@/lib/localCallExit";
import {
  readSessionMembersSnapshot,
  writeSessionMembersSnapshot,
  type SessionMemberSnapshotRow,
} from "@/lib/sessionMembersSnapshot";
import {
  CALL_MEMBERS_ACTIVE_POLL_MS,
  CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
  logCallMembersSync,
  logCallPeerRemoveRemote,
  logCallPresenceStaleGrace,
  logCallPresenceRemoteAbsent,
  logCallPresenceAbsentCandidate,
  logCallPresenceAbsentGraceHold,
  logCallPresenceAbsentConfirmed,
} from "@/lib/callMembersSync";
import { isMemberCallActive } from "@/lib/callPresenceGrace";
import {
  CALL_DEPARTED_LABEL_MS,
  evaluateCallParticipationPriority,
  logCallStatusPriority,
  resolveFinalStatusChoice,
} from "@/lib/callStatusPriority";
import {
  diffCallPresenceToasts,
  pruneRecentPresenceKeys,
  shouldIncludeMemberInCallGrid,
  type CallPresenceToast,
} from "@/lib/callPresenceToasts";
import {
  setMemberNameCache,
  type MemberNameCache,
} from "@/lib/memberNameCache";
import { shouldShowClassVoteUi } from "@/lib/sessionClassVote";

type Member = {
  device_id: string;
  display_name: string;
  photo_path: string | null;
  avatar_url?: string | null;
  lastSpokeAt?: number;
  is_in_call?: boolean;
  screen?: string | null;
  presence_session_id?: string | null;
  joined_at?: string | null;
  last_seen_at?: string | null;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";

type VoiceEntryMode = "checking" | "gate" | "mic" | "listen_only";

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
    lobby_extended_once?: boolean;
    join_open_until?: string | null;
    members_locked_at?: string | null;
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
    presence_session_id?: string | null;
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

function mapSnapshotMemberToCallMember(member: SessionMemberSnapshotRow): Member | null {
  const deviceId = String(member.device_id ?? "").trim();
  if (!deviceId) return null;
  return {
    device_id: deviceId,
    display_name: String(member.display_name ?? "").trim() || "参加者",
    photo_path: member.photo_path ?? null,
    avatar_url: member.avatar_url ?? null,
    is_in_call: member.is_in_call ?? undefined,
    screen: member.screen ?? undefined,
    joined_at: member.joined_at ?? undefined,
  };
}

function mergeSeededCallMembers(prev: Member[], seeded: Member[]): Member[] {
  const byId = new Map<string, Member>();
  for (const member of seeded) {
    const id = String(member.device_id ?? "").trim();
    if (id) byId.set(id, member);
  }
  for (const member of prev) {
    const id = String(member.device_id ?? "").trim();
    if (!id) continue;
    const existing = byId.get(id);
    byId.set(id, existing ? { ...existing, ...member, lastSpokeAt: member.lastSpokeAt } : member);
  }
  return Array.from(byId.values());
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
    resetCallReadinessSessionLog(sessionId);
    markVoicePerf("call_screen_mounted");

    callMembersLatencyRef.current = {
      startedAt: Date.now(),
      fromDisplayMembers: 1,
      fromRemoteMembers: 0,
      logged: false,
    };
    voiceReadinessRef.current = {
      remoteIds: [],
      settingsReady: false,
      signalReady: false,
      turnReady: false,
      voiceEnabled: true,
      awaitingAnswerPeerIds: [],
      anyAwaitingAnswer: false,
    };
    voiceConnectStartedAtRef.current = null;
    voicePlaybackPromptLoggedRef.current = false;
    callReadySinceRef.current = null;
    callReadyStuckLoggedRef.current = false;
    setShowCallStuckReconnect(false);
    setVoiceJoinFatalError(false);
    setRemoteAudioHealth({});
    setVoiceEntryMode("checking");
    setGateBusy(false);
    setGateError(null);
    setMicReady(false);
    setMicPermissionDenied(false);
    resetMicSessionForRejoin("rejoin");
    memberEmptyStreakRef.current = 0;
    memberDropStreakRef.current = 0;

    if (deviceId) {
      clearLocalLeftCall(sessionId, deviceId);
      localExitedPeersRef.current.delete(deviceId);
      selfLeftCallRef.current = false;
    }
  }, [sessionId, deviceId]);

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
    return withDev(resolveShellDashboardPath());
  }, []);

  const [members, setMembers] = useState<Member[]>([]);
  const [presenceToasts, setPresenceToasts] = useState<CallPresenceToast[]>([]);
  const presencePrimedRef = useRef(false);
  const previousInCallIdsRef = useRef<Set<string>>(new Set());
  const recentPresenceKeysRef = useRef<Set<string>>(new Set());
  const memberNameCacheRef = useRef<MemberNameCache>(new Map());
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
  const remoteAudioHealthRef = useRef(remoteAudioHealth);
  remoteAudioHealthRef.current = remoteAudioHealth;
  const [capacity, setCapacity] = useState(5);
  const [sessionCreatedAt, setSessionCreatedAt] = useState<string | null>(null);
  const [joinOpenUntil, setJoinOpenUntil] = useState<string | null>(null);
  const [membersLockedAt, setMembersLockedAt] = useState<string | null>(null);
  const [lobbyExtendedOnce, setLobbyExtendedOnce] = useState(false);
  const [lobbyExtendBusy, setLobbyExtendBusy] = useState(false);
  const [lobbyQuitBusy, setLobbyQuitBusy] = useState(false);
  const [lobbyExtendError, setLobbyExtendError] = useState<string | null>(null);
  const [fetchErrorCount, setFetchErrorCount] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [classVoteCount, setClassVoteCount] = useState(0);
  const [classVoteSelfVoted, setClassVoteSelfVoted] = useState(false);
  const [classVotePromoted, setClassVotePromoted] = useState(false);
  const [classVoteMembersLocked, setClassVoteMembersLocked] = useState(false);
  const [classVoteLifecycle, setClassVoteLifecycle] = useState<string | null>(
    null
  );
  const [classVoteBusy, setClassVoteBusy] = useState(false);
  const [classVoteCanShow, setClassVoteCanShow] = useState(false);

  const retryTimerRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);
  const pendingFetchReasonRef = useRef<string | null>(null);
  const lastSpeakerIdRef = useRef<string | null>(null);
  const everConnectedPeersRef = useRef<Set<string>>(new Set());
  const prevCallStatusRef = useRef<Record<string, string>>({});
  const prevCallStatusPeerLogRef = useRef<Record<string, string>>({});
  const peerLabelHysteresisRef = useRef<Record<string, PeerLabelHysteresisState>>({});
  const peerStatusPhaseRef = useRef<Record<string, CallStatusPhase>>({});
  const peerConnectedHoldAtRef = useRef<
    Record<string, { softAt?: number; strictAt?: number }>
  >({});
  const missingRemoteAudioWarnedRef = useRef<Set<string>>(new Set());
  const manualPeerHardResetRef = useRef<
    (remoteId: string) => void | Promise<void>
  >(() => {});
  const localExitedPeersRef = useRef<Set<string>>(new Set());
  /** Leave-signal sticky (mirrors voice explicitRemoved for UI diagnosis). */
  const explicitRemovedPeersRef = useRef<Set<string>>(new Set());
  /** Blocks presence heartbeat from re-marking screen=call after explicit leave. */
  const selfLeftCallRef = useRef(false);
  const membersSyncRevisionRef = useRef(0);
  const memberEmptyStreakRef = useRef(0);
  const memberDropStreakRef = useRef(0);
  const firstFastMembersAtRef = useRef<number | null>(null);
  const memberLastInCallAtRef = useRef<Map<string, number>>(new Map());
  const memberLastInListAtRef = useRef<Map<string, number>>(new Map());
  const apiSessionMemberIdsRef = useRef<Set<string>>(new Set());
  const memberAbsentSinceRef = useRef<Map<string, number>>(new Map());
  const memberJoinTransitionSinceRef = useRef<Map<string, number>>(new Map());
  const recentlyDepartedUntilRef = useRef<Map<string, number>>(new Map());
  const [membersSyncRevision, setMembersSyncRevision] = useState(0);
  const voiceReadinessRef = useRef({
    remoteIds: [] as string[],
    settingsReady: false,
    signalReady: false,
    turnReady: false,
    voiceEnabled: true,
    awaitingAnswerPeerIds: [] as string[],
    anyAwaitingAnswer: false,
  });
  const callReadySinceRef = useRef<number | null>(null);
  const callReadyStuckLoggedRef = useRef(false);
  const callReadyWaitRef = useRef<CallReadinessWaitState>(
    createCallReadinessWaitState("pending")
  );
  const voiceConnectStartedAtRef = useRef<number | null>(null);
  const voicePlaybackPromptLoggedRef = useRef(false);
  const voiceLayerMountedRef = useRef(false);
  const lastCallRenderLogKeyRef = useRef("");
  const callMountAtRef = useRef(Date.now());
  const renderCountRef = useRef(0);
  const lastFetchAtRef = useRef<number | null>(null);
  const realtimeFetchDebounceRef = useRef<number | null>(null);
  const callMembersLatencyRef = useRef<{
    startedAt: number | null;
    fromDisplayMembers: number;
    fromRemoteMembers: number;
    logged: boolean;
  }>({
    startedAt: null,
    fromDisplayMembers: 0,
    fromRemoteMembers: 0,
    logged: false,
  });
  const [showCallStuckReconnect, setShowCallStuckReconnect] = useState(false);
  const [voiceJoinFatalError, setVoiceJoinFatalError] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [voiceEntryMode, setVoiceEntryMode] = useState<VoiceEntryMode>("checking");
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState<{
    title: string;
    body: string;
    showInAppHint: boolean;
  } | null>(null);
  const retryMicPermissionRef = useRef<() => Promise<boolean>>(() =>
    Promise.resolve(false)
  );
  const [profileTarget, setProfileTarget] = useState<MemberProfileTarget | null>(
    null
  );
  const [meetingPlan, setMeetingPlan] = useState<MeetingPlanPublic | null>(null);
  const [callRequest, setCallRequest] = useState<CallRequestPublic | null>(null);

  const prevCallUserMutedRef = useRef<boolean | null>(null);

  useEffect(() => {
    userMutedRef.current = userMuted;
    logVoiceUiUserMutedState({
      userMuted,
      refMuted: userMutedRef.current,
      prevMuted: prevCallUserMutedRef.current,
      source: "call_client_state",
      micReady,
    });
    prevCallUserMutedRef.current = userMuted;
  }, [userMuted, micReady]);

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
      setRemoteAudioHealth({});
      voiceConnectStartedAtRef.current = null;
      voicePlaybackPromptLoggedRef.current = false;
      callReadySinceRef.current = null;
      callReadyStuckLoggedRef.current = false;
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

  useEffect(() => {
    if (!sessionId || !deviceId) return;

    let cancelled = false;

    async function loadClassVoteStatus() {
      try {
        const qs = new URLSearchParams({
          sessionId,
          deviceId,
        });
        const res = await fetch(
          `/api/session/class-vote-status?${qs.toString()}`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !json?.ok) return;

        setClassVoteCount(Number(json.voteCount ?? 0));
        setClassVoteSelfVoted(json.selfVoted === true);
        setClassVotePromoted(json.promoted === true);
        setClassVoteMembersLocked(json.membersLocked === true);
        setClassVoteLifecycle(
          json.lifecycle != null ? String(json.lifecycle) : null
        );
        setClassVoteCanShow(
          json.canShowVoteUi === true ||
            shouldShowClassVoteUi({
              memberCount: Number(json.memberCount ?? members.length),
              membersLocked: json.membersLocked === true,
              lifecycle: json.lifecycle != null ? String(json.lifecycle) : null,
              promoted: json.promoted === true,
            })
        );
      } catch {
        // Keep last known vote status on transient errors.
      }
    }

    void loadClassVoteStatus();
    const timer = window.setInterval(loadClassVoteStatus, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, deviceId, members.length]);

  const handleClassVote = useCallback(async () => {
    if (!sessionId || !deviceId || classVoteBusy || classVoteSelfVoted) return;
    setClassVoteBusy(true);
    try {
      const res = await fetch("/api/session/class-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          deviceId,
          classId: classId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        console.warn("[call] class-vote failed", json?.error ?? res.status);
        return;
      }
      setClassVoteCount(Number(json.voteCount ?? 0));
      setClassVoteSelfVoted(true);
      if (json.promoted === true) {
        setClassVotePromoted(true);
        setClassVoteLifecycle("official");
        setClassVoteCanShow(true);
      }
    } catch (err) {
      console.warn("[call] class-vote error", err);
    } finally {
      setClassVoteBusy(false);
    }
  }, [sessionId, deviceId, classId, classVoteBusy, classVoteSelfVoted]);

  const extendAloneWait = useCallback(async () => {
    if (lobbyExtendBusy || lobbyExtendedOnce || !sessionId || !deviceId) return;
    setLobbyExtendBusy(true);
    setLobbyExtendError(null);
    try {
      const res = await fetch("/api/session/lobby-extend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, deviceId }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (json?.error === "already_extended") {
          setLobbyExtendedOnce(true);
          setLobbyExtendError("すでに延長済みです");
        } else {
          setLobbyExtendError("延長に失敗しました。もう一度お試しください。");
        }
        return;
      }
      setLobbyExtendedOnce(true);
      if (json.created_at) {
        setSessionCreatedAt(String(json.created_at));
      }
    } catch {
      setLobbyExtendError("延長に失敗しました。通信環境を確認してください。");
    } finally {
      setLobbyExtendBusy(false);
    }
  }, [deviceId, lobbyExtendBusy, lobbyExtendedOnce, sessionId]);

  const quitAloneWaitAndGoHome = useCallback(async () => {
    if (lobbyQuitBusy) return;
    setLobbyQuitBusy(true);
    try {
      if (sessionId && deviceId) {
        await fetch("/api/session/leave", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, deviceId }),
          cache: "no-store",
        }).catch(() => null);
      }
      logNavigationIntent("alone_wait_quit", "CallClient.alone_wait_quit");
      releaseSessionMic("alone_wait_quit", sessionId);
      router.push(withDev(resolveShellDashboardPath()));
    } finally {
      setLobbyQuitBusy(false);
    }
  }, [deviceId, lobbyQuitBusy, router, sessionId]);

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

  useEffect(() => {
    if (!sessionId || !classId || !deviceId) return;

    const snapshot = readSessionMembersSnapshot(sessionId, classId);
    if (!snapshot || snapshot.members.length === 0) return;

    const seeded = snapshot.members
      .map((member) => mapSnapshotMemberToCallMember(member))
      .filter((member): member is Member => member != null)
      .map((member) => applyLocalLeftCallOverride(member))
      .filter((member) => String(member.device_id ?? "").trim());

    if (seeded.length === 0) return;

    setMembers((prev) => {
      const merged = mergeSeededCallMembers(prev, seeded);
      if (areMembersListEquivalent(prev, merged)) return prev;
      debugConsoleLog(
        `[call-members] seed-from-snapshot count=${merged.length} ` +
          `session=${sessionId.slice(-6)} ageMs=${Date.now() - snapshot.updatedAt}`
      );
      membersSyncRevisionRef.current += 1;
      setMembersSyncRevision(membersSyncRevisionRef.current);
      return merged;
    });
  }, [sessionId, classId, deviceId, applyLocalLeftCallOverride]);

  /** Leave the call and return to Room — keeps session_members row; clears in-call state. */
  const markSelfLeftCall = useCallback(() => {
    const did = String(deviceId ?? "").trim();
    if (!did || !sessionId) return;
    if (selfLeftCallRef.current) return;
    selfLeftCallRef.current = true;

    logNavigationIntent("left_call_return_room", "CallClient.markSelfLeftCall");
    markLocalLeftCall(sessionId, did, LOCAL_LEFT_CALL_EXPLICIT_REASON);
    localExitedPeersRef.current.add(did);
    setPeerStates({});
    setPeerDiagnostics({});
    setRemoteAudioHealth({});
    prevCallStatusRef.current = {};
    prevCallStatusPeerLogRef.current = {};
    everConnectedPeersRef.current.clear();
    voiceConnectStartedAtRef.current = null;
    voicePlaybackPromptLoggedRef.current = false;
    setVoiceJoinFatalError(false);
    setShowCallStuckReconnect(false);
    callReadySinceRef.current = null;
    callReadyStuckLoggedRef.current = false;

    writeSessionMembersSnapshot(sessionId, classId, members);

    setMembers((prev) =>
      prev.map((member) =>
        String(member.device_id ?? "").trim() === did
          ? { ...member, is_in_call: false, screen: "room" }
          : member
      )
    );
    membersSyncRevisionRef.current += 1;
    setMembersSyncRevision(membersSyncRevisionRef.current);

    // Broadcast explicit leave so remotes hide this peer immediately.
    void supabase
      .from("call_signals")
      .insert({
        session_id: sessionId,
        from_device_id: did,
        to_device_id: null,
        signal_type: "leave",
        payload: { reason: "explicit_leave" },
      })
      .then(({ error }) => {
        if (error) {
          console.warn("[call] leave signal insert failed", error);
        }
      });

    logSessionInCallFalseWrite({
      source: "CallClient.markSelfLeftCall",
      reason: "explicit_leave",
      sessionId,
      deviceId: did,
      explicitLeave: true,
    });

    void supabase
      .from("session_members")
      .update({ is_in_call: false })
      .eq("session_id", sessionId)
      .eq("device_id", did)
      .then(({ error }) => {
        if (error) {
          console.warn("[call] session_members is_in_call=false failed", error);
        }
      });

    if (classId) {
      void postClassPresence({
        classId,
        deviceId: did,
        sessionId,
        screen: "room",
        source: "CallClient.markSelfLeftCall",
        reason: "explicit_leave",
        explicitLeave: true,
      }).catch((e) => {
        console.warn("[call] optimistic room presence failed", e);
      });
    }
  }, [classId, deviceId, sessionId, members]);

  const handleExplicitRemoteLeave = useCallback(
    (remoteId: string) => {
      const id = String(remoteId ?? "").trim();
      if (!id || id === String(deviceId ?? "").trim()) return;
      localExitedPeersRef.current.add(id);
      explicitRemovedPeersRef.current.add(id);
      recentlyDepartedUntilRef.current.delete(id);
      memberLastInCallAtRef.current.delete(id);
      memberJoinTransitionSinceRef.current.delete(id);
      setMembers((prev) =>
        prev.map((member) =>
          String(member.device_id ?? "").trim() === id
            ? { ...member, is_in_call: false, screen: "room" }
            : member
        )
      );
      membersSyncRevisionRef.current += 1;
      setMembersSyncRevision(membersSyncRevisionRef.current);
    },
    [deviceId]
  );

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
        debugConsoleLog(
          `[call-perf] fetchMembers skip=in_flight reason=${reason}`
        );
        return;
      }

      fetchingRef.current = true;
      const useFast = shouldUseFastSessionStatus({ fast: opts?.fast });

      try {
        const qs = new URLSearchParams({
          sessionId,
          classId,
          lite: "1",
        });
        if (useFast) {
          qs.set("fast", "1");
        }
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
        const visibilityProbe: Array<{
          raw: Member;
          overridden: Member;
          stickyBefore: boolean;
          clearEligibleByRaw: boolean;
        }> = [];

        for (const m of incoming) {
          const did = String(m.device_id ?? "").trim();
          if (!did) continue;

          const rawMember: Member = {
            device_id: did,
            display_name: formatMemberDisplayName(m),
            photo_path: String(m.photo_path ?? "").trim() || null,
            avatar_url: String(m.avatar_url ?? "").trim() || null,
            is_in_call: m.is_in_call === true,
            screen: String(m.screen ?? "").trim() || null,
            presence_session_id:
              String(m.presence_session_id ?? "").trim() || null,
            joined_at: String(m.joined_at ?? "").trim() || null,
            last_seen_at: String(m.last_seen_at ?? "").trim() || null,
          };
          const stickyBefore =
            localExitedPeersRef.current.has(did) ||
            explicitRemovedPeersRef.current.has(did) ||
            hasLocalLeftCall(sessionId, did);

          // Server-confirmed rejoin: clear leave sticky BEFORE local override.
          const clearEligibleByRaw = shouldClearStickyLeaveOnServerRejoin({
            viewerSessionId: sessionId,
            presenceSessionId: rawMember.presence_session_id,
            is_in_call: rawMember.is_in_call,
            screen: rawMember.screen,
            last_seen_at: rawMember.last_seen_at,
          });
          if (clearEligibleByRaw) {
            clearCallLeaveStickyForDevice(
              {
                localExitedPeers: localExitedPeersRef.current,
                explicitRemovedPeers: explicitRemovedPeersRef.current,
              },
              did
            );
            clearLocalLeftCall(sessionId, did);
          }

          const overridden = applyLocalLeftCallOverride(rawMember);
          visibilityProbe.push({
            raw: rawMember,
            overridden,
            stickyBefore,
            clearEligibleByRaw,
          });
          nextMembers.push(overridden);
        }

        const nextApiIds = new Set(nextMembers.map((m) => m.device_id));
        const syncNow = Date.now();

        for (const m of nextMembers) {
          const id = String(m.device_id ?? "").trim();
          if (!id || id === deviceId) continue;
          if (isMemberCallActive(m)) {
            memberJoinTransitionSinceRef.current.delete(id);
          } else if (nextApiIds.has(id)) {
            if (!memberJoinTransitionSinceRef.current.has(id)) {
              memberJoinTransitionSinceRef.current.set(id, syncNow);
              logCallPresenceAbsentGraceHold({
                remoteId: id,
                reason: "join_transition",
                elapsedMs: 0,
              });
            }
          }
        }

        for (const id of Array.from(apiSessionMemberIdsRef.current)) {
          if (nextApiIds.has(id)) continue;
          if (!memberAbsentSinceRef.current.has(id)) {
            memberAbsentSinceRef.current.set(id, syncNow);
            logCallPresenceAbsentCandidate({
              remoteId: id,
              reason: "session_member_missing",
              elapsedMs: 0,
            });
            logCallPresenceRemoteAbsent({
              remoteId: id,
              reason: "session_member_missing",
            });
            logCallPresenceStaleGrace({
              remoteId: id,
              phase: "start",
              graceMs: CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
            });
          } else {
            const absentSince = memberAbsentSinceRef.current.get(id) ?? syncNow;
            if (syncNow - absentSince >= CALL_LIVE_MEMBER_ABSENT_GRACE_MS) {
              recentlyDepartedUntilRef.current.set(
                id,
                syncNow + CALL_DEPARTED_LABEL_MS
              );
              logCallPresenceAbsentConfirmed({
                remoteId: id,
                reason: "session_member_missing_grace_expired",
                elapsedMs: syncNow - absentSince,
              });
              logCallPresenceStaleGrace({
                remoteId: id,
                phase: "expired",
                graceMs: CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
              });
              logCallPeerRemoveRemote({
                remoteId: id,
                reason: "absent_grace_expired",
                graceMs: CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
              });
            }
          }
        }
        for (const id of nextApiIds) {
          memberAbsentSinceRef.current.delete(id);
          recentlyDepartedUntilRef.current.delete(id);
        }
        apiSessionMemberIdsRef.current = nextApiIds;

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

        const visibilityNow = Date.now();
        for (const probe of visibilityProbe) {
          const id = String(probe.raw.device_id ?? "").trim();
          if (!id) continue;
          const rawInCall = probe.raw.is_in_call === true;
          const rawScreen = String(probe.raw.screen ?? "").trim() || "-";
          const afterInCall = probe.overridden.is_in_call === true;
          const afterScreen =
            String(probe.overridden.screen ?? "").trim() || "-";
          const localExited = localExitedPeersRef.current.has(id);
          const explicitRemoved = explicitRemovedPeersRef.current.has(id);
          const sessionStorageLeft = hasLocalLeftCall(sessionId, id);
          const clearEligibleByRaw = probe.clearEligibleByRaw;
          const stickyAfter =
            localExited || explicitRemoved || sessionStorageLeft;
          const stickyCleared = probe.stickyBefore && !stickyAfter;
          const localExitedCall = localExited || sessionStorageLeft;
          const isInCall = afterInCall && !localExitedCall;
          const participation = evaluateCallParticipationPriority({
            nowMs: visibilityNow,
            explicitLeft: localExitedCall,
            inApiSessionMembers: nextApiIds.has(id),
            absentSinceMs: memberAbsentSinceRef.current.get(id) ?? null,
            joinTransitionSinceMs:
              memberJoinTransitionSinceRef.current.get(id) ?? null,
            isInCall,
            lastSeenAt: probe.overridden.last_seen_at,
            lastInCallAtMs: memberLastInCallAtRef.current.get(id) ?? null,
            screen: probe.overridden.screen,
          });
          const includedInGrid = shouldIncludeMemberInCallGrid({
            priority: participation.priority,
            recentlyDepartedUntilMs:
              recentlyDepartedUntilRef.current.get(id) ?? null,
            nowMs: visibilityNow,
            isInCall,
          });
          const excludeReason = resolveCallMemberUiExcludeReason({
            rawInCall,
            rawScreen,
            localExitedPeers: localExited,
            explicitRemoved,
            sessionStorageLeft,
            afterOverrideInCall: afterInCall,
            afterOverrideScreen: afterScreen,
            participationPriority: participation.priority,
            includedInGrid,
            clearEligibleByRaw,
          });

          logCallMemberVisibility({
            deviceId: id,
            sessionId,
            reason,
            rawInCall,
            rawScreen,
            afterOverrideInCall: afterInCall,
            afterOverrideScreen: afterScreen,
            localExitedPeers: localExited,
            explicitRemoved,
            sessionStorageLeft,
            confirmedLeftCall: resolveConfirmedLeftCallFlag(probe.overridden),
            clearEligibleByRaw,
            stickyCleared,
            inVisibleMembers: includedInGrid,
            excludeReason,
          });
        }

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
              memberLastInListAt: memberLastInListAtRef.current,
              preserveGraceMs: CALL_LIVE_MEMBER_ABSENT_GRACE_MS,
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
              logCallMembersSync({
                reason,
                prev,
                next: nextDisplay,
                context: "call",
              });
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
            debugConsoleLog(
              `[call-perf] fetchMembers apply skipped=same_members reason=${reason}`
            );
            return prev;
          }
          logCallMembersSync({
            reason,
            prev,
            next: nextDisplay,
            context: "call",
          });
          membersChanged = true;
          return nextDisplay;
        });

        if (redirectRemoved) {
          logNavigationIntent("removed_from_session", "CallClient.fetchMembers");
          logRouteChange(getCurrentPath(), resolveShellDashboardPath(), "removed_from_session");
          releaseSessionMic("removed_from_session", sessionId);
          router.replace(withDev(resolveShellDashboardPath()));
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

        writeSessionMembersSnapshot(sessionId, classId, nextMembers);

        if (Number.isFinite(Number(json.session?.capacity))) {
          setCapacity(Number(json.session?.capacity));
        }
        if (json.session?.created_at) {
          setSessionCreatedAt(String(json.session.created_at));
        }
        if (typeof json.session?.lobby_extended_once === "boolean") {
          setLobbyExtendedOnce(json.session.lobby_extended_once);
        }
        if ("join_open_until" in (json.session ?? {})) {
          setJoinOpenUntil(
            json.session?.join_open_until
              ? String(json.session.join_open_until)
              : null
          );
        }
        if ("members_locked_at" in (json.session ?? {})) {
          setMembersLockedAt(
            json.session?.members_locked_at
              ? String(json.session.members_locked_at)
              : null
          );
          if (json.session?.members_locked_at) {
            setClassVoteMembersLocked(true);
          }
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
          debugConsoleLog(
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
    apiSessionMemberIdsRef.current = new Set();
    memberAbsentSinceRef.current = new Map();
    memberJoinTransitionSinceRef.current = new Map();
    recentlyDepartedUntilRef.current = new Map();
    memberNameCacheRef.current = new Map();
    presencePrimedRef.current = false;
    previousInCallIdsRef.current = new Set();
    recentPresenceKeysRef.current = new Set();
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

    let cancelled = false;
    let heartbeatTimer: number | null = null;
    let initialRetryTimer: number | null = null;
    let resumeInFlight: Promise<void> | null = null;

    async function publishCallActivePresence(reason: string): Promise<boolean> {
      if (
        !shouldPublishCallPresence({
          documentHidden:
            typeof document !== "undefined" ? document.hidden : false,
          selfLeftCall: selfLeftCallRef.current,
        })
      ) {
        return false;
      }

      const body = buildCallActivePresenceBody({
        classId,
        deviceId,
        sessionId,
      });

      try {
        const res = await fetch("/api/class/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        if (!res.ok) {
          debugVoiceRetryable("call:presence", "presence_heartbeat_failed", {
            message: `status=${res.status}`,
            reason,
          });
          return false;
        }
      } catch (e) {
        debugVoiceRetryable("call:presence", "presence_heartbeat_failed", {
          message: e instanceof Error ? e.message : String(e),
          reason,
        });
        return false;
      }

      if (cancelled || selfLeftCallRef.current) return false;

      const { error } = await supabase
        .from("session_members")
        .update({ is_in_call: true })
        .eq("session_id", sessionId)
        .eq("device_id", deviceId);
      if (error) {
        debugVoiceRetryable("call:presence", "session_members_in_call_failed", {
          message: error.message,
          reason,
        });
      }

      return !cancelled && !selfLeftCallRef.current;
    }

    async function resumeCallPresence(reason: string) {
      if (resumeInFlight) {
        await resumeInFlight;
        return;
      }

      resumeInFlight = (async () => {
        const ok = await publishCallActivePresence(reason);
        if (!ok || cancelled) return;
        // Refresh local member SoT after presence is call-active again so
        // remotes (and this client) converge on fresh screen=call.
        void fetchMembers(`presence_${reason}`);
      })();

      try {
        await resumeInFlight;
      } finally {
        resumeInFlight = null;
      }
    }

    void resumeCallPresence("mount");

    initialRetryTimer = window.setTimeout(() => {
      void resumeCallPresence("mount_retry");
    }, 500);

    const schedulePresence = () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        void publishCallActivePresence("heartbeat");
      }, getBackgroundSyncIntervalMs(10_000, 30_000));
    };
    schedulePresence();

    const onForeground = (type: "visibilitychange" | "pageshow" | "focus") => {
      schedulePresence();
      if (
        !isCallForegroundResumeEvent({
          type,
          visibilityState:
            typeof document !== "undefined"
              ? document.visibilityState
              : undefined,
        })
      ) {
        return;
      }
      void resumeCallPresence(type);
    };

    const onVisibilityChange = () => onForeground("visibilitychange");
    const onPageShow = () => onForeground("pageshow");
    const onFocus = () => onForeground("focus");

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (initialRetryTimer) window.clearTimeout(initialRetryTimer);
      // Intentionally skip screen=room here — see shouldPostRoomPresenceOnCallEffectCleanup.
      if (shouldPostRoomPresenceOnCallEffectCleanup()) {
        void postClassPresence({
          classId,
          deviceId,
          sessionId,
          screen: "room",
          source: "CallClient.presenceEffectCleanup",
          reason: "effect_cleanup",
          explicitLeave: false,
        }).catch(() => {});
      }
    };
  }, [classId, sessionId, deviceId, fetchMembers]);

  // Removed standalone visibility→fetchMembers: presence resume publishes
  // screen=call first, then refetches members so SoT is not read stale.
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
    if (!classId) return;

    const channel = supabase
      .channel(`call-presence-${classId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "class_presence",
          filter: `class_id=eq.${classId}`,
        },
        () => {
          if (realtimeFetchDebounceRef.current) {
            window.clearTimeout(realtimeFetchDebounceRef.current);
          }
          realtimeFetchDebounceRef.current = window.setTimeout(() => {
            realtimeFetchDebounceRef.current = null;
            void fetchMembers("class_presence_realtime");
          }, CALL_REALTIME_FETCH_DEBOUNCE_MS);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [classId, fetchMembers]);

  useEffect(() => {
    if (!sessionId) return;

    const pollMs =
      members.length >= 2 ? CALL_MEMBERS_ACTIVE_POLL_MS : CALL_MEMBERS_POLL_MS;
    const pollReason =
      members.length >= 2 ? "poll_active_call" : "poll_member_shortage";

    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchMembers(pollReason);
    }, pollMs);

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

    for (const id of Object.keys(peerLabelHysteresisRef.current)) {
      if (!memberIds.has(id)) {
        delete peerLabelHysteresisRef.current[id];
        delete peerStatusPhaseRef.current[id];
        delete peerConnectedHoldAtRef.current[id];
        delete prevCallStatusRef.current[id];
      }
    }
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

  const lastRemoteSpeakingCommitRef = useRef<Map<string, number>>(new Map());

  const handleRemoteSpeakingChange = useCallback((remoteId: string) => {
    const now = Date.now();
    const lastCommit = lastRemoteSpeakingCommitRef.current.get(remoteId) ?? 0;
    if (now - lastCommit < 1500) return;

    setMembers((prev) => {
      const member = prev.find((m) => m.device_id === remoteId);
      if (member?.lastSpokeAt != null && now - member.lastSpokeAt < 1500) {
        return prev;
      }
      lastRemoteSpeakingCommitRef.current.set(remoteId, now);
      return prev.map((m) =>
        m.device_id === remoteId ? { ...m, lastSpokeAt: now } : m
      );
    });
  }, []);

  const handleSoftResetExhausted = useCallback(
    (remoteId: string, reason: string) => {
      voiceProdLog(
        `[call-soft-reset] exhausted remote=${remoteId.slice(-4)} reason=${reason}`
      );
      setVoiceJoinFatalError(true);
    },
    []
  );

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
          current?.audioConfirmedStrict === normalizedHealth.audioConfirmedStrict &&
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
    if (voiceEntryMode === "listen_only") return "聞き専";
    if (!micReady) return "マイク準備中…";
    return userMuted ? "ミュート解除" : "ミュート";
  }, [micReady, userMuted, voiceEntryMode]);

  const getMemberStatus = useCallback(
    (member?: Member) => {
      if (!member) {
        return {
          text: "待機ルーム内",
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

      if (isMe && voiceEntryMode === "listen_only") {
        const listenOnlyStatus = {
          text: "聞き専",
          color: "#6b7280",
          chipBg: "#f3f4f6",
          chipText: "#6b7280",
          reason: "listen_only",
          source: "localMic",
        };
        const prevText = prevCallStatusRef.current[memberId];
        if (prevText !== listenOnlyStatus.text) {
          logParticipationStatusDecision({
            context: "call",
            deviceId: memberId,
            label: listenOnlyStatus.text,
            status: "in_call",
            used: listenOnlyStatus.source,
            reason: listenOnlyStatus.reason,
            sources: {
              is_in_call: member.is_in_call ?? null,
              screen: "call",
              peerState: peerStates[memberId] ?? "idle",
              micReady: false,
              isMe: true,
            },
          });
          prevCallStatusRef.current[memberId] = listenOnlyStatus.text;
        }
        return listenOnlyStatus;
      }

      if (
        isMe &&
        !micReady &&
        (voiceEntryMode === "checking" || voiceEntryMode === "gate")
      ) {
        const prepText = micPermissionDenied ? "マイク未許可" : "マイク準備中";
        const prepStatus = {
          text: prepText,
          color: "#92400e",
          chipBg: "#fffbeb",
          chipText: "#b45309",
          reason: micPermissionDenied
            ? "mic_permission_denied"
            : "entry_gate",
          source: "localMic",
        };
        const prevText = prevCallStatusRef.current[memberId];
        if (prevText !== prepStatus.text) {
          logParticipationStatusDecision({
            context: "call",
            deviceId: memberId,
            label: prepStatus.text,
            status: "waiting",
            used: prepStatus.source,
            reason: prepStatus.reason,
            sources: {
              is_in_call: member.is_in_call ?? null,
              screen: member.screen ?? "room",
              peerState: peerStates[memberId] ?? "idle",
              micReady: false,
              isMe: true,
            },
          });
          prevCallStatusRef.current[memberId] = prepStatus.text;
        }
        return prepStatus;
      }

      if (!micReady && isMe) {
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

      if (isMe && selfExplicitlyLeft) {
        const waiting = {
          text: "待機ルーム内",
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
          text: userMuted ? "自分 / ミュート中" : "通話中",
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
              remoteDeviceId: memberId,
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
        voicePeerRepairInProgress: diag?.voicePeerRepairInProgress === true,
        autoHardResetGiveUp: diag?.autoHardResetGiveUp === true,
        reconnectRequestPending: diag?.reconnectRequestPending === true,
        wasPeerConnected,
        nowMs,
        debugUi: isVoiceLayerDebugEnabled(),
        audioUnhealthySinceMs,
        remoteDeviceId: memberId,
      });

      const participation = evaluateCallParticipationPriority({
        nowMs,
        explicitLeft: localExitedCall,
        inApiSessionMembers:
          isMe || apiSessionMemberIdsRef.current.has(memberId),
        absentSinceMs: memberAbsentSinceRef.current.get(memberId) ?? null,
        joinTransitionSinceMs:
          memberJoinTransitionSinceRef.current.get(memberId) ?? null,
        isInCall,
        lastSeenAt: member.last_seen_at,
        lastInCallAtMs: memberLastInCallAtRef.current.get(memberId) ?? null,
        screen: member.screen,
      });

      const rawStatus = resolveCallMemberStatus({
        isMe,
        isMuted: userMuted,
        isInCall,
        inSessionMember:
          isMe || apiSessionMemberIdsRef.current.has(memberId),
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
        voicePeerRepairInProgress: diag?.voicePeerRepairInProgress === true,
        autoHardResetGiveUp:
          participation.peerStillInCall && diag?.autoHardResetGiveUp === true,
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
        showReconnectButton:
          participation.peerStillInCall && manualReconnect.show,
        nowMs,
        remoteDeviceId: memberId,
        participationPriority: participation.priority,
        peerStillInCall: participation.peerStillInCall,
        audioUnhealthySinceMs,
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
        audioConfirmedStrict: audioHealth?.audioConfirmedStrict === true,
        lastPlaybackConfirmedAt:
          diag?.lastPlaybackConfirmedAt ??
          (audioHealth?.audioConfirmedStrict === true ? nowMs : null),
        connectedSoftAtMs:
          peerConnectedHoldAtRef.current[memberId]?.softAt ?? null,
        connectedStrictAtMs:
          peerConnectedHoldAtRef.current[memberId]?.strictAt ?? null,
      });
      peerLabelHysteresisRef.current[memberId] = labelState;

      if (!isMe) {
        const nextPhase = mapCallStatusLabelToPhase(status.text, status.reason);
        const prevPhase = peerStatusPhaseRef.current[memberId] ?? "other";
        const transition = resolveCallStatusTransitionLog({
          prevPhase,
          nextPhase,
          statusReason: status.reason,
        });
        if (transition) {
          logCallStatusTransition({
            remoteDeviceId: memberId,
            from: transition.from,
            to: transition.to,
            reason: transition.reason,
            text: status.text,
          });
          const holdState = peerConnectedHoldAtRef.current[memberId] ?? {};
          if (transition.to === "connected_soft") {
            peerConnectedHoldAtRef.current[memberId] = {
              ...holdState,
              softAt: nowMs,
            };
          }
          if (transition.to === "connected") {
            peerConnectedHoldAtRef.current[memberId] = {
              softAt: holdState.softAt ?? nowMs,
              strictAt: nowMs,
            };
          }
        }
        peerStatusPhaseRef.current[memberId] = nextPhase;
      }

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

      if (!isMe) {
        logCallStatusPriority({
          remoteId: memberId,
          chosen: resolveFinalStatusChoice({
            participationPriority: participation.priority,
            statusText: status.text,
            statusReason: status.reason,
          }),
          reason: status.reason,
          participationPriority: participation.priority,
        });
      }

      return status;
    },
    [callInfo, deviceId, micPermissionDenied, userMuted, voiceEntryMode, nowMs, peerDiagnostics, peerStates, remoteAudioHealth, sessionId]
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
  void hasOtherMember;

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

  const visibleMembers = useMemo(() => {
    return sortedMembers.filter((member) => {
      const memberId = String(member.device_id ?? "").trim();
      if (!memberId) return false;
      const localExitedCall =
        localExitedPeersRef.current.has(memberId) ||
        hasLocalLeftCall(sessionId, memberId);
      const isInCall = member.is_in_call === true && !localExitedCall;
      const participation = evaluateCallParticipationPriority({
        nowMs,
        explicitLeft: localExitedCall,
        inApiSessionMembers: apiSessionMemberIdsRef.current.has(memberId),
        absentSinceMs: memberAbsentSinceRef.current.get(memberId) ?? null,
        joinTransitionSinceMs:
          memberJoinTransitionSinceRef.current.get(memberId) ?? null,
        isInCall,
        lastSeenAt: member.last_seen_at,
        lastInCallAtMs: memberLastInCallAtRef.current.get(memberId) ?? null,
        screen: member.screen,
      });
      return shouldIncludeMemberInCallGrid({
        priority: participation.priority,
        recentlyDepartedUntilMs:
          recentlyDepartedUntilRef.current.get(memberId) ?? null,
        nowMs,
        isInCall,
      });
    });
  }, [sortedMembers, nowMs, membersSyncRevision, sessionId]);

  useEffect(() => {
    const nameCache = memberNameCacheRef.current;
    // Remember names while members are still known (before leave removes them).
    for (const member of sortedMembers) {
      const id = String(member.device_id ?? "").trim();
      if (!id) continue;
      setMemberNameCache(nameCache, {
        userId: id,
        memberId: id,
        deviceId: id,
        displayName: member.display_name,
      });
    }

    const nextIds = new Set<string>();
    const nameById = new Map<string, string>();
    for (const member of visibleMembers) {
      const id = String(member.device_id ?? "").trim();
      if (!id) continue;
      const localExitedCall =
        localExitedPeersRef.current.has(id) || hasLocalLeftCall(sessionId, id);
      if (localExitedCall) continue;
      if (member.is_in_call !== true) continue;
      const screen = String(member.screen ?? "").trim();
      if (screen === "room" || screen === "home" || screen === "offline") {
        continue;
      }
      nextIds.add(id);
      const displayName = String(member.display_name ?? "").trim() || "参加者";
      nameById.set(id, displayName);
      setMemberNameCache(nameCache, {
        userId: id,
        memberId: id,
        deviceId: id,
        displayName,
      });
    }

    // Seed leave lookups from cache before nextIds drops the leaver.
    for (const id of previousInCallIdsRef.current) {
      if (nameById.has(id)) continue;
      const cached = nameCache.get(id);
      if (cached?.displayName) nameById.set(id, cached.displayName);
    }

    const result = diffCallPresenceToasts({
      previousIds: previousInCallIdsRef.current,
      nextIds,
      primed: presencePrimedRef.current,
      selfDeviceId: deviceId,
      nameById,
      nameCache,
      recentKeys: recentPresenceKeysRef.current,
      leaveReason: "left_in_call_set",
      pruneNameCacheOnLeave: true,
    });

    presencePrimedRef.current = result.primed;
    previousInCallIdsRef.current = result.nextPreviousIds;
    recentPresenceKeysRef.current = pruneRecentPresenceKeys(
      result.nextRecentKeys
    );

    if (result.toasts.length > 0) {
      setPresenceToasts((prev) => [...prev, ...result.toasts].slice(-6));
    }
  }, [visibleMembers, sortedMembers, deviceId, nowMs, sessionId]);

  useEffect(() => {
    if (presenceToasts.length === 0) return;
    const timer = window.setTimeout(() => {
      setPresenceToasts((prev) => prev.slice(1));
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [presenceToasts]);

  const handleMicReadyChange = useCallback((ready: boolean) => {
    setMicReady(ready);
    if (ready) {
      markVoicePerf("local_mic_ready");
      setVoiceEntryMode((mode) =>
        mode === "checking" || mode === "gate" ? "mic" : mode
      );
      setGateError(null);
      setMicPermissionDenied(false);
    }
  }, []);

  const handleMicPermissionDeniedChange = useCallback((denied: boolean) => {
    setMicPermissionDenied(denied);
  }, []);

  const handleMicRetryReady = useCallback((retry: () => Promise<boolean>) => {
    retryMicPermissionRef.current = retry;
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
      awaitingAnswerPeerIds: string[];
      anyAwaitingAnswer: boolean;
    }) => {
      voiceReadinessRef.current = snapshot;
      runCallReadinessRecheckRef.current("voice_readiness");
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

  useEffect(() => {
    const latency = callMembersLatencyRef.current;
    const displayCount = members.length;
    const remoteCount = remoteMemberIds.length;

    if (displayCount <= 1 && remoteCount === 0) {
      if (latency.startedAt == null) {
        latency.startedAt = Date.now();
        latency.fromDisplayMembers = displayCount;
        latency.fromRemoteMembers = remoteCount;
      }
      return;
    }

    if (
      !latency.logged &&
      displayCount >= 2 &&
      remoteCount >= 1 &&
      latency.startedAt != null
    ) {
      logCallMembersLatency({
        sessionId,
        deviceId,
        fromDisplayMembers: latency.fromDisplayMembers,
        toDisplayMembers: displayCount,
        fromRemoteMembers: latency.fromRemoteMembers,
        toRemoteMembers: remoteCount,
        elapsedMs: Date.now() - latency.startedAt,
        source: "call_entry",
      });
      latency.logged = true;
    }
  }, [members.length, remoteMemberIds.length, sessionId, deviceId]);

  useLayoutEffect(() => {
    renderCountRef.current += 1;
  });

  const lastCallRenderPerfLogRef = useRef({ count: 0, atMs: 0 });

  useEffect(() => {
    if (!isDebugVoiceEnabled()) return;
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
      debugConsoleLog(
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

  const voiceLayerActive =
    voiceLayerShouldRender &&
    (voiceEntryMode === "mic" || voiceEntryMode === "listen_only");

  const voiceSelfReconnecting = useMemo(() => {
    if (!voiceLayerActive || voiceJoinFatalError) return false;
    const states = Object.values(peerStates);
    const anyConnected = states.some((state) => state === "connected");
    const peerReconnecting = Object.values(peerDiagnostics).some(
      (diag) =>
        diag?.autoHardResetInProgress === true ||
        diag?.voicePeerRepairInProgress === true
    );
    if (peerReconnecting && !anyConnected) return true;
    const peerConnecting = states.some((state) => state === "connecting");
    // Avoid sticky "再接続中" while at least one peer is already connected.
    if (anyConnected) return false;
    return peerConnecting;
  }, [peerDiagnostics, peerStates, voiceJoinFatalError, voiceLayerActive]);

  useEffect(() => {
    if (!voiceLayerActive || remoteMemberIds.length === 0) return;

    const hasPlaybackEvidence = Object.values(remoteAudioHealth).some(
      (health) =>
        health.playSuccess === true ||
        health.playbackActive === true ||
        health.audioConfirmedStrict === true ||
        health.audioActuallyPlaying === true
    );
    if (hasPlaybackEvidence) {
      setVoiceJoinFatalError(false);
      return;
    }

    const allRemotesGaveUp = remoteMemberIds.every((remoteId) => {
      return peerDiagnostics[remoteId]?.autoHardResetGiveUp === true;
    });
    if (allRemotesGaveUp) {
      setVoiceJoinFatalError(true);
    }
  }, [
    peerDiagnostics,
    remoteAudioHealth,
    remoteMemberIds,
    voiceLayerActive,
  ]);

  const showMicEntryGate =
    voiceLayerShouldRender &&
    !micReady &&
    (voiceEntryMode === "checking" || voiceEntryMode === "gate");

  const showMicPermissionWarning =
    !micReady &&
    (micPermissionDenied ||
      gateError != null ||
      ((voiceEntryMode === "checking" || voiceEntryMode === "gate") &&
        callInfo.includes("許可")));

  const handleGateRequestMic = useCallback(async () => {
    if (!sessionId || !deviceId) return;
    setGateBusy(true);
    setGateError(null);
    const result = await requestCallMicrophone({
      sessionId,
      deviceId,
      userMuted: userMutedRef.current,
      reason: "gate_request",
    });
    setGateBusy(false);
    if (result.ok) {
      console.log("[voice-entry] mode=mic gate_request");
      setVoiceEntryMode("mic");
      setMicPermissionDenied(false);
      setGateError(null);
      setMicReady(true);
      return;
    }
    console.log(
      `[voice-entry] blocked reason=${result.permissionDenied ? "mic_permission_denied" : "mic_failed"}`
    );
    setGateError({
      title: result.title,
      body: result.message,
      showInAppHint: result.showInAppBrowserHint,
    });
    setMicPermissionDenied(result.permissionDenied);
  }, [deviceId, sessionId]);

  const handleListenOnlyEntry = useCallback(() => {
    console.log("[voice-entry] listen-only mode");
    userMutedRef.current = true;
    setUserMuted(true);
    setMicPermissionDenied(false);
    setGateError(null);
    setVoiceEntryMode("listen_only");
  }, []);

  useEffect(() => {
    const detection = detectInAppBrowser();
    if (detection.detected) {
      console.log(
        `[browser] in-app-browser detected=true uaHint=${detection.uaHint}/${detection.platform}`
      );
    }
  }, []);

  useEffect(() => {
    if (!voiceLayerShouldRender) return;
    if (!sessionId || !deviceId) return;

    let cancelled = false;

    void (async () => {
      if (isCallMicSessionActive(sessionId)) {
        console.log("[voice-entry] mode=mic session_cache");
        setVoiceEntryMode("mic");
        setMicPermissionDenied(false);
        setGateError(null);
        setMicReady(true);
        return;
      }

      setVoiceEntryMode("checking");
      setGateError(null);

      const permissionState = await queryMicrophonePermissionState();
      console.log(`[mic] permission-state ${permissionState}`);
      if (cancelled) return;

      if (permissionState === "granted") {
        const result = await requestCallMicrophone({
          sessionId,
          deviceId,
          userMuted: userMutedRef.current,
          reason: "auto_granted",
        });
        if (cancelled) return;
        if (result.ok) {
          console.log("[voice-entry] mode=mic auto_granted");
          setVoiceEntryMode("mic");
          setMicPermissionDenied(false);
          setGateError(null);
          setMicReady(true);
          return;
        }
        console.log("[voice-entry] blocked reason=mic_permission_denied");
        setGateError({
          title: result.title,
          body: result.message,
          showInAppHint: result.showInAppBrowserHint,
        });
        setMicPermissionDenied(result.permissionDenied);
        setVoiceEntryMode("gate");
        logCallEntryBlocked(deviceId, "mic_permission_denied");
        return;
      }

      setVoiceEntryMode("gate");
      logCallEntryBlocked(deviceId, "mic_permission_gate");
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId, sessionId, voiceLayerShouldRender]);

  useEffect(() => {
    if (voiceEntryMode === "gate" || voiceEntryMode === "checking") {
      handleVoiceCleanup();
    }
  }, [handleVoiceCleanup, voiceEntryMode]);

  useEffect(() => {
    return () => {
      resetMicSessionForRejoin("leave");
      releaseSessionMic("call_client_unmount");
    };
  }, []);

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
      const sessionKey = `${snap.sessionId}|${snap.classId}|${snap.deviceId}`;
      callReadyWaitRef.current = updateCallReadinessWaitState(
        callReadyWaitRef.current,
        snap,
        sessionKey
      );
      const waitMetrics = formatCallReadinessWaitMetrics(
        callReadyWaitRef.current,
        snap
      );
      logCallReadyCheck(snap, reason, waitMetrics);
      const stuckReason = resolveCallReadyStuckReason(snap);
      const peersConnected = Object.values(peerStatesForReadinessRef.current).some(
        (state) => state === "connected"
      );
      const hasPlaybackEvidence = Object.values(remoteAudioHealthRef.current).some(
        (health) =>
          health.playSuccess === true ||
          health.playbackActive === true ||
          health.audioConfirmedStrict === true
      );
      if (!stuckReason || peersConnected || hasPlaybackEvidence) {
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
        logCallReadyStuck(stuckReason, snap, stuckMs, {
          awaitingAnswer: voiceReadinessRef.current.anyAwaitingAnswer,
          playbackEvidence: hasPlaybackEvidence,
        });
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
    voiceConnectStartedAtRef.current = null;
    voicePlaybackPromptLoggedRef.current = false;
    callReadyWaitRef.current = createCallReadinessWaitState(
      `${sessionId}|${classId}|${deviceId}`
    );
    setShowCallStuckReconnect(false);
    setVoiceJoinFatalError(false);
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

  useEffect(() => {
    if (!voiceLayerActive || remoteMemberIds.length === 0) {
      voiceConnectStartedAtRef.current = null;
      voicePlaybackPromptLoggedRef.current = false;
      return;
    }

    if (voiceConnectStartedAtRef.current == null) {
      voiceConnectStartedAtRef.current = Date.now();
    }

    const timer = window.setInterval(() => {
      const startedAt = voiceConnectStartedAtRef.current;
      if (startedAt == null) return;

      const hasPlaybackEvidence = Object.values(remoteAudioHealthRef.current).some(
        (health) =>
          health.playSuccess === true ||
          health.playbackActive === true ||
          health.audioConfirmedStrict === true ||
          health.audioActuallyPlaying === true
      );
      if (hasPlaybackEvidence) {
        voicePlaybackPromptLoggedRef.current = false;
        setVoiceJoinFatalError(false);
        return;
      }

      if (voiceReadinessRef.current.anyAwaitingAnswer) {
        return;
      }

      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs < VOICE_PLAYBACK_CONNECT_TARGET_MS) return;

      if (!voicePlaybackPromptLoggedRef.current) {
        voicePlaybackPromptLoggedRef.current = true;
        const voice = voiceReadinessRef.current;
        voiceProdLog(
          `[call-ready-stuck] reason=playback_evidence_timeout elapsedMs=${elapsedMs} ` +
            `targetMs=${VOICE_PLAYBACK_CONNECT_TARGET_MS} remotes=${remoteMemberIds.length} ` +
            `members=${members.length} remoteIds=${voice.remoteIds.length} ` +
            `signalReady=${voice.signalReady ? 1 : 0} settingsReady=${voice.settingsReady ? 1 : 0} ` +
            `turnReady=${voice.turnReady ? 1 : 0} micReady=${micReady ? 1 : 0} ` +
            `callLayerMounted=${voiceLayerMountedRef.current ? 1 : 0} ` +
            `awaitingAnswer=${voice.anyAwaitingAnswer ? 1 : 0}`
        );
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [members.length, micReady, remoteMemberIds.length, sessionId, voiceLayerActive]);

  const handleCallStuckReconnect = useCallback(() => {
    if (voiceReadinessRef.current.anyAwaitingAnswer) {
      debugConsoleLog(
        `[call-ready-stuck] manual-reconnect-blocked reason=awaiting_remote_answer ` +
          `peers=${voiceReadinessRef.current.awaitingAnswerPeerIds
            .map((id) => id.slice(-4))
            .join(",") || "-"}`
      );
      return;
    }

    const snap = buildCallReadinessSnapshot();
    logCallReadyCheck(snap, "manual_reconnect");
    callReadySinceRef.current = Date.now();
    callReadyStuckLoggedRef.current = false;
    setShowCallStuckReconnect(false);
    setVoiceJoinFatalError(false);
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
    if (areVoiceConnectionMembersEquivalent(voiceMembersRef.current, next)) {
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

  const voiceLayerNode = voiceLayerActive ? (
    <CallVoiceLayer
      sessionId={sessionId}
      deviceId={deviceId}
      members={voiceMembers}
      membersSyncRevision={membersSyncRevision}
      userMuted={userMuted}
      userMutedRef={userMutedRef}
      listenOnly={voiceEntryMode === "listen_only"}
      voiceEntryMode={voiceEntryMode}
      autoAcquireOnMount={voiceEntryMode === "mic"}
      presenceMembers={members}
      onLocalTrackMutedApplied={handleLocalTrackMutedApplied}
      onMicReadyChange={handleMicReadyChange}
      onMicPermissionDeniedChange={handleMicPermissionDeniedChange}
      onMicRetryReady={handleMicRetryReady}
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
      onSoftResetExhausted={handleSoftResetExhausted}
      onExplicitRemoteLeave={handleExplicitRemoteLeave}
    />
  ) : null;

  const entryGateSlot = showMicEntryGate ? (
    <>
      <InAppBrowserNotice />
      <MicEntryGate
        busy={gateBusy || voiceEntryMode === "checking"}
        errorTitle={gateError?.title}
        errorBody={gateError?.body}
        showInAppHint={gateError?.showInAppHint}
        onRequestMic={() => {
          void handleGateRequestMic();
        }}
        onListenOnly={handleListenOnlyEntry}
      />
    </>
  ) : null;

  const showClassVotePanel =
    classVoteCanShow ||
    shouldShowClassVoteUi({
      memberCount: members.length,
      membersLocked: classVoteMembersLocked,
      lifecycle: classVoteLifecycle,
      promoted: classVotePromoted,
    });

  const recruitmentView = buildCallRecruitmentView({
    memberCount: Math.max(members.length, filled),
    capacity,
    membersLockedAt: membersLockedAt ?? (classVoteMembersLocked ? "locked" : null),
    joinOpenUntil,
    sessionCreatedAt,
    lobbyExtendedOnce,
    nowMs: nowMs || Date.now(),
  });

  const recruitmentBanner =
    membersSyncRevision > 0 ? (
      <div
        className="cm-call-banner cm-call-recruitment"
        style={{
          marginTop: 12,
          padding: "12px 14px",
          borderRadius: 12,
          background:
            recruitmentView.phase === "closed"
              ? "#f8fafc"
              : recruitmentView.phase === "closing_soon"
                ? "#fff7ed"
                : "#ecfdf5",
          color:
            recruitmentView.phase === "closed"
              ? "#475569"
              : recruitmentView.phase === "closing_soon"
                ? "#9a3412"
                : "#065f46",
          border:
            recruitmentView.phase === "closed"
              ? "1px solid #e2e8f0"
              : recruitmentView.phase === "closing_soon"
                ? "1px solid #fed7aa"
                : "1px solid #a7f3d0",
          fontSize: 13,
          fontWeight: 800,
          display: "grid",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span>
            {recruitmentView.label}
            <span style={{ marginLeft: 8, fontWeight: 700, opacity: 0.85 }}>
              {recruitmentView.memberCount}/{recruitmentView.capacity}人
            </span>
          </span>
          {recruitmentView.recruitingOpen ? (
            <button
              type="button"
              className="cm-cta-primary cm-call-invite-prominent"
              onClick={() => {
                void (async () => {
                  if (!sessionId || !classId) {
                    alert("まだ招待リンクを作れません。");
                    return;
                  }
                  const inviteUrl = buildInviteRoomUrl({ classId, sessionId });
                  const result = await shareOrCopyInviteUrl({
                    url: inviteUrl,
                    title: "Classmate",
                    text: "通話に参加しませんか？",
                  });
                  if (result.ok && result.method === "clipboard") {
                    alert("招待リンクをコピーしました");
                  } else if (!result.ok) {
                    alert("招待リンクを共有できませんでした");
                  }
                })();
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #047857",
                background: "#059669",
                color: "#fff",
                fontWeight: 900,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              }}
            >
              友達を招待する
            </button>
          ) : null}
        </div>
        {recruitmentView.detail ? (
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>
            {recruitmentView.detail}
          </div>
        ) : null}
        {recruitmentView.aloneWaitTimedOut ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              paddingTop: 4,
            }}
          >
            {recruitmentView.canExtendAloneWait ? (
              <button
                type="button"
                disabled={lobbyExtendBusy || lobbyQuitBusy}
                onClick={() => {
                  void extendAloneWait();
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 13,
                  cursor:
                    lobbyExtendBusy || lobbyQuitBusy ? "not-allowed" : "pointer",
                  opacity: lobbyExtendBusy || lobbyQuitBusy ? 0.6 : 1,
                }}
              >
                {lobbyExtendBusy ? "延長中…" : "待機を続ける"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={lobbyExtendBusy || lobbyQuitBusy}
              onClick={() => {
                void quitAloneWaitAndGoHome();
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#374151",
                fontWeight: 900,
                fontSize: 13,
                cursor:
                  lobbyExtendBusy || lobbyQuitBusy ? "not-allowed" : "pointer",
                opacity: lobbyExtendBusy || lobbyQuitBusy ? 0.6 : 1,
              }}
            >
              {lobbyQuitBusy ? "退出中…" : "今回はやめる"}
            </button>
          </div>
        ) : null}
        {lobbyExtendError ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>
            {lobbyExtendError}
          </div>
        ) : null}
      </div>
    ) : null;

  const classVoteSlot = showClassVotePanel ? (
    <div
      className="cm-call-banner cm-call-class-vote"
      style={{
        marginTop: 12,
        padding: "12px 14px",
        borderRadius: 12,
        background: classVotePromoted ? "#ecfdf5" : "#f9fafb",
        color: classVotePromoted ? "#065f46" : "#374151",
        border: classVotePromoted ? "1px solid #a7f3d0" : "1px solid #e5e7eb",
        fontSize: 13,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {classVotePromoted ? (
          <span>クラスが成立しました</span>
        ) : (
          <>
            <span>希望 {classVoteCount}人</span>
            {classVoteSelfVoted ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>
                投票済みです
              </span>
            ) : null}
          </>
        )}
      </div>
      {!classVotePromoted && !classVoteSelfVoted ? (
        <button
          type="button"
          className="cm-cta-primary cm-call-action-btn"
          disabled={classVoteBusy}
          onClick={() => {
            void handleClassVote();
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #111827",
            background: classVoteBusy ? "#9ca3af" : "#111827",
            color: "#fff",
            fontWeight: 900,
            fontSize: 13,
            cursor: classVoteBusy ? "default" : "pointer",
          }}
        >
          {classVoteBusy ? "送信中…" : "このメンバーでクラスを作る"}
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <CallRoomView
      voiceLayer={voiceLayerNode}
      entryGateSlot={entryGateSlot}
      classVoteSlot={classVoteSlot}
      presenceToasts={presenceToasts}
      filled={filled}
      capacity={capacity}
      membersSyncRevision={membersSyncRevision}
      membersLocked={classVoteMembersLocked}
      showCallStuckReconnect={showCallStuckReconnect}
      onCallStuckReconnect={() => handleCallStuckReconnect()}
      meetingPlanLabel={
        meetingPlan && !meetingPlan.is_past
          ? `次の集合：${meetingPlan.display_label}`
          : null
      }
      callRequestLabel={
        callRequest?.is_active ? callRequest.display_label : null
      }
      onProfileEdit={() => router.push(profileEditHref)}
      onInviteFriends={async () => {
        if (!sessionId || !classId) {
          alert("まだ招待リンクを作れません。");
          return;
        }

        const inviteUrl = buildInviteRoomUrl({
          classId,
          sessionId,
        });

        const result = await shareOrCopyInviteUrl({
          url: inviteUrl,
          title: "Classmate",
          text: "通話に参加しませんか？",
        });
        if (result.ok && result.method === "clipboard") {
          alert("招待リンクをコピーしました");
        } else if (!result.ok) {
          alert("招待リンクを共有できませんでした");
        }
      }}
      onHome={() => {
        logNavigationIntent("return_home", "CallClient.home_button");
        router.push(withDev(resolveShellDashboardPath()));
      }}
      onExit={() => {
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
      fetchErrorCount={fetchErrorCount}
      showWaitingForOthers={false}
      bannerSlot={recruitmentBanner}
      visibleMembers={visibleMembers}
      deviceId={deviceId}
      classId={classId}
      sessionId={sessionId}
      nowMs={nowMs}
      getMemberStatus={getMemberStatus}
      peerDiagnostics={peerDiagnostics}
      remoteAudioHealth={remoteAudioHealth}
      isSessionMember={(memberId) => apiSessionMemberIdsRef.current.has(memberId)}
      wasPeerConnected={(memberId) => everConnectedPeersRef.current.has(memberId)}
      onMemberClick={(member) => {
        const memberDeviceId = normalizeMemberDeviceId(member.device_id);
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
      onManualAudioReconnect={handleManualAudioReconnect}
      showMicPermissionWarning={showMicPermissionWarning}
      micPermissionWarningTitle={
        gateError?.title ||
        callInfo ||
        (micPermissionDenied
          ? "マイクが許可されていません。ブラウザの設定からマイクを許可してから、もう一度お試しください。"
          : "マイク準備中…")
      }
      micPermissionWarningBody={gateError?.body}
      onRetryMic={() => {
        if (voiceEntryMode === "gate" || voiceEntryMode === "checking") {
          void handleGateRequestMic();
          return;
        }
        void retryMicPermissionRef.current();
      }}
      voiceJoinFatalError={voiceJoinFatalError}
      voiceSelfReconnecting={voiceSelfReconnecting}
      onVoiceReconnect={() => handleCallStuckReconnect()}
      muteDisabled={voiceEntryMode === "listen_only"}
      userMuted={userMuted}
      micReady={micReady}
      muteButtonLabel={muteButtonLabel}
      onMuteClick={() => {
        requestRemoteAudioUnlock();
        setUserMuted((prev) => {
          const next = !prev;
          userMutedRef.current = next;
          logVoiceUiMuteToggle({
            fromMuted: prev,
            toMuted: next,
            refMuted: userMutedRef.current,
          });
          logMuteStateSet({
            userMuted: next,
            prev,
            reason: next ? "user_click_mute" : "user_click_unmute",
            source: "user_click",
          });
          if (!next) {
            markCallMicEverUnmuted(sessionId, deviceId);
          }
          writeCallMutePreference(sessionId, deviceId, next, {
            source: "user_click",
          });
          voiceProdLog(
            `[voice-ui] mute-toggle-applied userMuted=${next ? 1 : 0} ` +
              `ref=${userMutedRef.current ? 1 : 0} stored=${readCallMutePreference(sessionId, deviceId) === true ? 1 : readCallMutePreference(sessionId, deviceId) === false ? 0 : "-"}`
          );
          return next;
        });
      }}
      micLevel={micLevel}
      boardSlot={sessionId ? <SharedCanvasBoard sessionId={sessionId} /> : null}
      messagesSlot={
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
      }
      profileModalSlot={
        <MemberProfileModal
          target={profileTarget}
          onClose={() => setProfileTarget(null)}
          returnTo={buildCurrentPathReturnTo(pathname, searchParams.toString())}
        />
      }
    />
  );

}