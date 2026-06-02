"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  installCallPageDiagnostics,
  logCallLifecycle,
  logCallStatusPeer,
  voiceDebugLog,
  type PeerStatusDiagnostics,
} from "@/app/call/voice/voiceDiagnostics";
import {
  getCurrentPath,
  logNavigationIntent,
  logRouteChange,
  readCallMutePreference,
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
import type { MeetingPlanPublic } from "@/lib/meetingPlanClient";
import type { CallRequestPublic } from "@/lib/callRequest";
import {
  logParticipationStatusDecision,
  resolveCallMemberStatus,
  resolveEffectivePeerConnection,
  shouldShowManualAudioReconnect,
} from "@/lib/memberPresenceStatus";
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
  lastSpokeAt?: number;
  is_in_call?: boolean;
  screen?: string | null;
};

type PeerState = "idle" | "connecting" | "connected" | "failed";

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
    joined_at?: string | null;
    is_in_call?: boolean | null;
    screen?: string | null;
    last_seen_at?: string | null;
  }>;
  memberCount?: number;
  error?: string;
};

function getAvatarUrl(photoPath?: string | null) {
  let normalized = String(photoPath ?? "").trim();

  if (!normalized) return "/default-avatar.jpg";

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  if (normalized.startsWith("profile-photos/")) {
    normalized = normalized.replace(/^profile-photos\//, "");
  }

  if (normalized.startsWith("avatars/")) {
    normalized = normalized.replace(/^avatars\//, "");
  }

  const { data } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(normalized);

  const publicUrl = data?.publicUrl?.trim();
  if (!publicUrl) return "/default-avatar.jpg";

  return `${publicUrl}?v=${encodeURIComponent(normalized)}`;
}

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
  const [isMuted, setIsMuted] = useState(true);
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
  const missingRemoteAudioWarnedRef = useRef<Set<string>>(new Set());
  const manualPeerHardResetRef = useRef<
    (remoteId: string) => void | Promise<void>
  >(() => {});
  const localExitedPeersRef = useRef<Set<string>>(new Set());
  const membersSyncRevisionRef = useRef(0);
  const [membersSyncRevision, setMembersSyncRevision] = useState(0);
  const [profileTarget, setProfileTarget] = useState<MemberProfileTarget | null>(
    null
  );
  const [meetingPlan, setMeetingPlan] = useState<MeetingPlanPublic | null>(null);
  const [callRequest, setCallRequest] = useState<CallRequestPublic | null>(null);

  useEffect(() => {
    setNowMs(Date.now());

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 500);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!sessionId || !deviceId) return;

    const restored = restoreCallSessionAfterReload({ sessionId, deviceId });
    if (restored.leftCallSanitized.cleared) {
      localExitedPeersRef.current.delete(deviceId);
    } else if (!hasLocalLeftCall(sessionId, deviceId)) {
      localExitedPeersRef.current.delete(deviceId);
    }

    const savedMute = readCallMutePreference(sessionId);
    if (savedMute != null && getCallNavigationType() === "reload") {
      setIsMuted(savedMute);
    }

    logCallLifecycle("mount", {
      sessionId,
      deviceId,
      extra: { navigationType: getCallNavigationType() },
    });
    clearCallBfcacheSuspend();
  }, [sessionId, deviceId]);

  useEffect(() => {
    return () => {
      logCallLifecycle("unmount", { sessionId, deviceId });
      setPeerStates({});
      setPeerDiagnostics({});
    };
  }, [sessionId, deviceId]);

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
      console.log("[call] sessionId changed", {
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

    void loadMeetingPlan();
    const timer = window.setInterval(loadMeetingPlan, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [classId, deviceId]);

  useEffect(() => {
    if (!classId || !deviceId) return;

    let cancelled = false;

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

    void loadCallRequest();
    const timer = window.setInterval(loadCallRequest, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [classId, deviceId]);

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

  const markSelfLeftCall = useCallback(() => {
    const did = String(deviceId ?? "").trim();
    if (!did || !sessionId) return;

    logNavigationIntent("explicit_leave", "CallClient.markSelfLeftCall");
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
    async (reason = "manual") => {
      if (!sessionId || !classId) return;
      if (fetchingRef.current) {
        pendingFetchReasonRef.current = reason;
        return;
      }

      fetchingRef.current = true;

      try {
        const qs = new URLSearchParams({
          sessionId,
          classId,
        });

        const res = await fetch(`/api/session/status?${qs.toString()}`, {
          cache: "no-store",
        });

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
              is_in_call: m.is_in_call === true,
              screen: String(m.screen ?? "").trim() || null,
            })
          );
        }

        console.log("[call] fetchMembers success", {
          reason,
          sessionId,
          deviceId,
          memberDeviceIds: nextMembers.map((m) => m.device_id),
          membersSyncRevision: membersSyncRevisionRef.current + 1,
          count: nextMembers.length,
        });

        const stillJoined = nextMembers.some(
          (m) => String(m.device_id ?? "").trim() === String(deviceId).trim()
        );

        if (deviceId && !stillJoined) {
          logNavigationIntent("removed_from_session", "CallClient.fetchMembers");
          logRouteChange(getCurrentPath(), "/", "removed_from_session");
          releaseSessionMic("removed_from_session", sessionId);
          router.replace(withDev("/"));
          return;
        }

        setMembers((prev) => {
          return nextMembers.map((m) => {
            const existing = prev.find((x) => x.device_id === m.device_id);
            return {
              ...m,
              lastSpokeAt: existing?.lastSpokeAt,
            };
          });
        });

        setFetchErrorCount(0);
        clearRetryTimer();
        membersSyncRevisionRef.current += 1;
        setMembersSyncRevision(membersSyncRevisionRef.current);

        if (Number.isFinite(Number(json.session?.capacity))) {
          setCapacity(Number(json.session?.capacity));
        }
      } catch (e: any) {
        const message = e?.message ?? "unknown_error";

        console.warn("[call] fetchMembers unexpected error", {
          reason,
          message,
        });

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
          void fetchMembers(pending);
        }
      }
    },
    [sessionId, classId, deviceId, router, clearRetryTimer, applyLocalLeftCallOverride]
  );

  useEffect(() => {
    void fetchMembers("initial");

    const sync2s = window.setTimeout(() => {
      void fetchMembers("sync_2s");
    }, 2000);
    const sync5s = window.setTimeout(() => {
      void fetchMembers("sync_5s");
    }, 5000);

    return () => {
      clearRetryTimer();
      window.clearTimeout(sync2s);
      window.clearTimeout(sync5s);
    };
  }, [fetchMembers, clearRetryTimer]);

  useEffect(() => {
    if (!sessionId || !deviceId) return;

    const cleanupDiagnostics = installCallPageDiagnostics({
      sessionId,
      deviceId,
      onBfcacheRestore: ({ sessionId: restoredSessionId, deviceId: restoredDeviceId }) => {
        if (restoredSessionId !== sessionId || restoredDeviceId !== deviceId) return;
        clearLocalLeftCall(sessionId, deviceId);
        localExitedPeersRef.current.delete(deviceId);
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
    console.log("[call] members state", {
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
        console.warn("[call] presence heartbeat failed", e);
      });
    }

    void sendPresence();

    window.setTimeout(() => {
      void sendPresence();
      void fetchMembers("presence_after_join");
    }, 500);

    window.setTimeout(() => {
      void fetchMembers("presence_after_join_2");
    }, 1500);

    const timer = window.setInterval(() => {
      void sendPresence();
    }, 10000);

    return () => {
      window.clearInterval(timer);
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
  }, [classId, sessionId, deviceId, fetchMembers]);

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
        async () => {
          await fetchMembers("session_members_realtime");
        }
      )
      .subscribe((status) => {
        console.log("[call] members subscribe status", {
          sessionId,
          status,
        });
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, fetchMembers]);

  useEffect(() => {
    if (!sessionId) return;

    const timer = window.setInterval(() => {
      void fetchMembers("poll");
    }, 10000);

    return () => window.clearInterval(timer);
  }, [sessionId, fetchMembers]);

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
    return isMuted ? "ミュート解除" : "ミュート";
  }, [micReady, isMuted]);

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
      const selfLeftCall =
        !!viewerId &&
        !!sessionId &&
        (hasLocalLeftCall(sessionId, viewerId) ||
          localExitedPeersRef.current.has(viewerId));
      const localExitedCall =
        localExitedPeersRef.current.has(memberId) ||
        hasLocalLeftCall(sessionId, memberId) ||
        (isMe && selfLeftCall);
      const isInCall = member.is_in_call === true && !localExitedCall;

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

      if (isMe && selfLeftCall) {
        const waiting = {
          text: "待機中",
          color: "#6b7280",
          chipBg: "#f3f4f6",
          chipText: "#6b7280",
          reason: "localExitedCall",
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
              selfLeftCall: true,
              isMe: true,
            },
          });
          prevCallStatusRef.current[memberId] = waiting.text;
        }
        return waiting;
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
        nowMs,
      });
      const wasPeerConnected = everConnectedPeersRef.current.has(memberId);
      const remoteAudioVerified =
        effective.effectiveConnected
          ? audioHealth?.verified === true
            ? true
            : audioHealth
              ? false
              : effective.activePlaybackConnected
                ? true
                : null
          : null;

      const status = resolveCallMemberStatus({
        isMe,
        isMuted,
        isInCall,
        screen: localExitedCall ? "room" : member.screen,
        localExitedCall,
        peerState,
        effectivePeerState: effective.effectivePeerState,
        activePlaybackConnected: effective.activePlaybackConnected,
        playbackActiveMode: audioHealth?.playbackActiveMode,
        hasPc: diag?.hasPc ?? false,
        orphanRemoteAudio: diag?.orphanRemoteAudio === true,
        p2pDirectFailedHoldActive: diag?.p2pDirectFailedHoldActive === true,
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
        nowMs,
      });

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
            selfLeftCall,
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
          audioLevel: audioHealth?.level ?? null,
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
    [callInfo, deviceId, isMuted, nowMs, peerDiagnostics, peerStates, remoteAudioHealth, sessionId]
  );

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

  const callMembers = useMemo(() => {
    return members;
  }, [members]);

  useEffect(() => {
    voiceDebugLog("[call] callMembers before voice layer", {
      count: callMembers.length,
      deviceId,
      callMembers: callMembers.map((m) => ({
        device_id: m.device_id,
        display_name: m.display_name,
        is_in_call: m.is_in_call,
        isMe: m.device_id === deviceId,
      })),
    });
  }, [callMembers, deviceId]);

  if (!deviceId) {
    return null;
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <CallVoiceLayer
        sessionId={sessionId}
        deviceId={deviceId}
        members={callMembers}
        membersSyncRevision={membersSyncRevision}
        isMuted={isMuted}
        onMicReadyChange={setMicReady}
        onMicLevelChange={(level) => {
          setMicLevel(level);

          if (!isMuted && level > 0.08) {
            setMembers((prev) =>
              prev.map((m) =>
                m.device_id === deviceId
                  ? { ...m, lastSpokeAt: Date.now() }
                  : m
              )
            );
          }
        }}
        onRemoteSpeakingChange={(remoteId) => {
          setMembers((prev) =>
            prev.map((m) =>
              m.device_id === remoteId
                ? { ...m, lastSpokeAt: Date.now() }
                : m
            )
          );
        }}
        onRemotePlaybackHealthChange={(remoteId, health) => {
          setRemoteAudioHealth((prev) => {
            const current = prev[remoteId];
            if (
              current?.verified === health.verified &&
              current?.playbackActive === health.playbackActive &&
              current?.playbackActiveMode === health.playbackActiveMode &&
              current?.audioActuallyPlaying === health.audioActuallyPlaying &&
              current?.trackReady === health.trackReady &&
              current?.playSuccess === health.playSuccess &&
              current?.lastPlaySuccessAt === health.lastPlaySuccessAt &&
              current?.playFailedAt === health.playFailedAt &&
              current?.lastAttachAt === health.lastAttachAt &&
              current?.level === health.level &&
              current?.currentTimeAdvanced === health.currentTimeAdvanced
            ) {
              return prev;
            }
            return {
              ...prev,
              [remoteId]: health,
            };
          });
        }}
        onRemoteCountChange={handleRemoteCountChange}
        onStatusChange={setCallInfo}
        onPeerStatesChange={setPeerStates}
        onPeerDiagnosticsChange={setPeerDiagnostics}
        onVoiceCleanup={handleVoiceCleanup}
        onManualPeerHardResetReady={handleManualPeerHardResetReady}
      />

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
              logNavigationIntent("explicit_leave", "CallClient.exit_button");
              logRouteChange(getCurrentPath(), roomHref, "explicit_leave");
              markSelfLeftCall();
              releaseSessionMic("call_exit", sessionId);
              router.push(roomHref);
            }}
          >
            退出
          </button>
        </div>
      </div>

      {fetchErrorCount > 0 && (
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
            const showManualAudioReconnect =
              !!member &&
              !isMe &&
              shouldShowManualAudioReconnect({
                isMe: false,
                statusText: status.text,
                statusReason: "reason" in status ? String(status.reason ?? "") : "",
                conn: diag?.conn ?? "-",
                ice: diag?.ice ?? "-",
                hasPc: diag?.hasPc ?? false,
                hasRemoteStream: diag?.hasRemoteStream ?? false,
                lastPlaybackConfirmedAt: diag?.lastPlaybackConfirmedAt ?? null,
                lastPlaybackActiveAt: diag?.lastPlaybackActiveAt ?? null,
                remoteAudioHealth: memberId
                  ? remoteAudioHealth[memberId] ?? null
                  : null,
                trackReady:
                  (memberId ? remoteAudioHealth[memberId]?.trackReady : null) ??
                  diag?.trackReady ??
                  "-",
                p2pDirectFailedHoldActive: diag?.p2pDirectFailedHoldActive === true,
                autoHardResetGiveUp: diag?.autoHardResetGiveUp === true,
                reconnectRequestPending: diag?.reconnectRequestPending === true,
                nowMs,
              });
            const avatarUrl = member ? getAvatarUrl(member.photo_path) : "";

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
                      <img
                        src={avatarUrl}
                        alt={member.display_name}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/default-avatar.jpg";
                        }}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
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
              background: isMuted ? "#fff" : "#111827",
              color: isMuted ? "#111827" : "#fff",
              fontWeight: 900,
              cursor: micReady ? "pointer" : "not-allowed",
              opacity: micReady ? 1 : 0.6,
            }}
            onClick={() => {
              requestRemoteAudioUnlock();
              setIsMuted((prev) => {
                const next = !prev;
                writeCallMutePreference(sessionId, next);
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